use chrono::{DateTime, Utc};
use lazy_static::lazy_static;
use regex::Regex;
use serde_json::Value;
use std::collections::HashSet;
use std::time::Duration;

use super::chunk::*;

/// Maximum time since last file modification before a session is dead.
pub const ONGOING_STALENESS_THRESHOLD: Duration = Duration::from_secs(120);

/// Returns true if the session is still ongoing (not stale).
/// Returns false if `is_ongoing` is false, or if `mod_time` exceeds the staleness threshold.
pub fn apply_staleness(is_ongoing: bool, mod_time: impl Into<DateTime<Utc>>) -> bool {
    if !is_ongoing {
        return false;
    }
    let elapsed = Utc::now()
        .signed_duration_since(mod_time.into())
        .to_std()
        .unwrap_or(Duration::ZERO);
    elapsed <= ONGOING_STALENESS_THRESHOLD
}

/// Check if a subagent is ongoing (chunk-based + file staleness).
pub fn is_subagent_ongoing(proc: &super::subagent::SubagentProcess) -> bool {
    is_ongoing(&proc.chunks) && apply_staleness(true, proc.file_mod_time)
}

lazy_static! {
    static ref APPROVE_PATTERN: Regex = Regex::new(r#""approve"\s*:\s*true"#).unwrap();
}

/// Checks if a tool_use block is a SendMessage shutdown_response with approve: true.
pub fn is_shutdown_approval(tool_name: &str, tool_input: &Option<Value>) -> bool {
    if tool_name != "SendMessage" {
        return false;
    }
    let input = match tool_input {
        Some(v) => v,
        None => return false,
    };
    if let Some(obj) = input.as_object() {
        let msg_type = obj.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let approve = obj.get("approve").and_then(|v| v.as_bool());
        if msg_type == "shutdown_response" && approve == Some(true) {
            return true;
        }
    }
    // Fallback to regex.
    APPROVE_PATTERN.is_match(&input.to_string())
}

/// Reports whether the session appears to still be in progress.
pub fn is_ongoing(chunks: &[Chunk]) -> bool {
    if chunks.is_empty() {
        return false;
    }

    // Trailing user prompt means Claude is processing.
    if chunks.last().map(|c| &c.chunk_type) == Some(&ChunkType::User) {
        return true;
    }

    // Collect activities from structured items.
    let mut activities: Vec<(ActivityType, usize)> = Vec::new();
    let mut act_idx = 0;
    let mut has_items = false;
    let mut shutdown_tool_ids: HashSet<String> = HashSet::new();

    for chunk in chunks {
        if chunk.chunk_type != ChunkType::AI {
            continue;
        }
        if chunk.items.is_empty() {
            continue;
        }
        has_items = true;

        for item in &chunk.items {
            match item.item_type {
                DisplayItemType::Thinking => {
                    activities.push((ActivityType::Thinking, act_idx));
                    act_idx += 1;
                }
                DisplayItemType::Output => {
                    if !item.text.trim().is_empty() {
                        activities.push((ActivityType::TextOutput, act_idx));
                        act_idx += 1;
                    }
                }
                DisplayItemType::ToolCall => {
                    if item.tool_name == "ExitPlanMode" {
                        activities.push((ActivityType::ExitPlanMode, act_idx));
                        act_idx += 1;
                    } else if is_shutdown_approval(&item.tool_name, &item.tool_input) {
                        shutdown_tool_ids.insert(item.tool_id.clone());
                        activities.push((ActivityType::Interruption, act_idx));
                        act_idx += 1;
                    } else {
                        activities.push((ActivityType::ToolUse, act_idx));
                        act_idx += 1;
                    }
                    if !item.tool_result.is_empty() {
                        if shutdown_tool_ids.contains(&item.tool_id) {
                            activities.push((ActivityType::Interruption, act_idx));
                        } else {
                            activities.push((ActivityType::ToolResult, act_idx));
                        }
                        act_idx += 1;
                    }
                }
                DisplayItemType::Subagent => {
                    activities.push((ActivityType::ToolUse, act_idx));
                    act_idx += 1;
                    if !item.tool_result.is_empty() {
                        activities.push((ActivityType::ToolResult, act_idx));
                        act_idx += 1;
                    }
                }
                DisplayItemType::TeammateMessage | DisplayItemType::HookEvent => {}
            }
        }
    }

    if has_items {
        if is_ongoing_from_activities(&activities) {
            return true;
        }
        return has_pending_agents(chunks);
    }

    // Fallback for old-style chunks.
    for c in chunks.iter().rev() {
        if c.chunk_type == ChunkType::AI {
            return c.stop_reason != "end_turn";
        }
    }

    false
}

#[derive(Debug, Clone, PartialEq)]
enum ActivityType {
    TextOutput,
    Thinking,
    ToolUse,
    ToolResult,
    Interruption,
    ExitPlanMode,
}

fn is_ending(at: &ActivityType) -> bool {
    matches!(
        at,
        ActivityType::TextOutput | ActivityType::Interruption | ActivityType::ExitPlanMode
    )
}

fn is_ai_activity(at: &ActivityType) -> bool {
    matches!(
        at,
        ActivityType::Thinking | ActivityType::ToolUse | ActivityType::ToolResult
    )
}

fn is_ongoing_from_activities(activities: &[(ActivityType, usize)]) -> bool {
    if activities.is_empty() {
        return false;
    }

    let mut last_ending_idx: Option<usize> = None;
    for (at, idx) in activities.iter().rev() {
        if is_ending(at) {
            last_ending_idx = Some(*idx);
            break;
        }
    }

    match last_ending_idx {
        None => activities.iter().any(|(at, _)| is_ai_activity(at)),
        Some(lei) => activities
            .iter()
            .any(|(at, idx)| *idx > lei && is_ai_activity(at)),
    }
}

fn has_pending_agents(chunks: &[Chunk]) -> bool {
    for chunk in chunks {
        if chunk.chunk_type != ChunkType::AI {
            continue;
        }
        for item in &chunk.items {
            match item.item_type {
                DisplayItemType::Subagent => {
                    if item.tool_result.is_empty() {
                        return true;
                    }
                }
                DisplayItemType::ToolCall => {
                    if (item.tool_name == "Task" || item.tool_name == "Agent")
                        && item.tool_result.is_empty()
                    {
                        return true;
                    }
                }
                _ => {}
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, Utc};
    use serde_json::json;

    fn make_chunk(chunk_type: ChunkType) -> Chunk {
        Chunk {
            chunk_type,
            ..Default::default()
        }
    }

    fn make_item(item_type: DisplayItemType) -> DisplayItem {
        DisplayItem {
            item_type,
            ..Default::default()
        }
    }

    // --- apply_staleness tests ---

    #[test]
    fn apply_staleness_false_when_not_ongoing() {
        assert!(!apply_staleness(false, Utc::now()));
    }

    #[test]
    fn apply_staleness_true_when_ongoing_and_recent() {
        let recent = Utc::now() - Duration::seconds(10);
        assert!(apply_staleness(true, recent));
    }

    #[test]
    fn apply_staleness_false_when_ongoing_and_stale() {
        let stale = Utc::now() - Duration::seconds(300);
        assert!(!apply_staleness(true, stale));
    }

    // --- is_shutdown_approval tests ---

    #[test]
    fn is_shutdown_approval_true_for_valid_shutdown() {
        let input = Some(json!({
            "type": "shutdown_response",
            "approve": true
        }));
        assert!(is_shutdown_approval("SendMessage", &input));
    }

    #[test]
    fn is_shutdown_approval_false_for_other_tools() {
        let input = Some(json!({
            "type": "shutdown_response",
            "approve": true
        }));
        assert!(!is_shutdown_approval("Bash", &input));
    }

    #[test]
    fn is_shutdown_approval_false_for_missing_fields() {
        let input = Some(json!({"type": "other_type"}));
        assert!(!is_shutdown_approval("SendMessage", &input));
    }

    #[test]
    fn is_shutdown_approval_false_for_none_input() {
        assert!(!is_shutdown_approval("SendMessage", &None));
    }

    // --- is_ongoing tests ---

    #[test]
    fn is_ongoing_empty_chunks_returns_false() {
        assert!(!is_ongoing(&[]));
    }

    #[test]
    fn is_ongoing_trailing_user_chunk_returns_true() {
        let chunks = vec![make_chunk(ChunkType::AI), make_chunk(ChunkType::User)];
        assert!(is_ongoing(&chunks));
    }

    #[test]
    fn is_ongoing_ai_chunk_with_end_turn_returns_false() {
        let mut ai_chunk = make_chunk(ChunkType::AI);
        ai_chunk.stop_reason = "end_turn".to_string();
        let chunks = vec![ai_chunk];
        assert!(!is_ongoing(&chunks));
    }

    #[test]
    fn is_ongoing_pending_agent_returns_true() {
        let mut ai_chunk = make_chunk(ChunkType::AI);
        ai_chunk.items.push(DisplayItem {
            item_type: DisplayItemType::Subagent,
            tool_name: "Task".to_string(),
            tool_result: String::new(), // no result = pending
            ..Default::default()
        });
        let chunks = vec![ai_chunk];
        assert!(is_ongoing(&chunks));
    }

    #[test]
    fn is_ongoing_text_output_at_end_returns_false() {
        let mut ai_chunk = make_chunk(ChunkType::AI);
        ai_chunk.items.push(DisplayItem {
            item_type: DisplayItemType::ToolCall,
            tool_name: "Bash".to_string(),
            tool_result: "done".to_string(),
            ..Default::default()
        });
        ai_chunk.items.push(DisplayItem {
            item_type: DisplayItemType::Output,
            text: "Here is the result".to_string(),
            ..Default::default()
        });
        let chunks = vec![ai_chunk];
        assert!(!is_ongoing(&chunks));
    }

    #[test]
    fn is_ongoing_tool_use_after_text_returns_true() {
        let mut ai_chunk = make_chunk(ChunkType::AI);
        ai_chunk.items.push(DisplayItem {
            item_type: DisplayItemType::Output,
            text: "Let me check".to_string(),
            ..Default::default()
        });
        ai_chunk.items.push(DisplayItem {
            item_type: DisplayItemType::ToolCall,
            tool_name: "Bash".to_string(),
            tool_result: String::new(), // no result yet
            ..Default::default()
        });
        let chunks = vec![ai_chunk];
        assert!(is_ongoing(&chunks));
    }
}
