use serde::Serialize;

/// ToolCategory classifies tool calls into broad functional groups.
/// Used by the GUI to assign per-category icons and colors.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum ToolCategory {
    Read,
    Edit,
    Write,
    Bash,
    Grep,
    Glob,
    Task,
    Tool,
    Web,
    Cron,
    Other,
}

/// CategorizeToolName maps a raw tool name to a ToolCategory.
pub fn categorize_tool_name(name: &str) -> ToolCategory {
    match name {
        // Claude Code core tools
        "Read" => ToolCategory::Read,
        "Edit" => ToolCategory::Edit,
        "Write" | "NotebookEdit" => ToolCategory::Write,
        "Bash" => ToolCategory::Bash,
        "Grep" => ToolCategory::Grep,
        "Glob" => ToolCategory::Glob,
        "Task" | "Agent" | "TaskCreate" | "TaskUpdate" | "TaskList" | "TaskGet" | "TaskStop"
        | "TaskOutput" => ToolCategory::Task,
        "TeamCreate" | "TeamDelete" | "SendMessage" => ToolCategory::Task,
        "Skill"
        | "ToolSearch"
        | "LSP"
        | "TodoWrite"
        | "AskUserQuestion"
        | "ListMcpResourcesTool"
        | "ReadMcpResourceTool" => ToolCategory::Tool,
        "EnterPlanMode" | "ExitPlanMode" | "EnterWorktree" | "ExitWorktree" => ToolCategory::Tool,
        "WebFetch" | "WebSearch" => ToolCategory::Web,
        "CronCreate" | "CronDelete" | "CronList" => ToolCategory::Cron,

        _ => ToolCategory::Other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_code_core_tools() {
        assert_eq!(categorize_tool_name("Read"), ToolCategory::Read);
        assert_eq!(categorize_tool_name("Edit"), ToolCategory::Edit);
        assert_eq!(categorize_tool_name("Write"), ToolCategory::Write);
        assert_eq!(categorize_tool_name("NotebookEdit"), ToolCategory::Write);
        assert_eq!(categorize_tool_name("Bash"), ToolCategory::Bash);
        assert_eq!(categorize_tool_name("Grep"), ToolCategory::Grep);
        assert_eq!(categorize_tool_name("Glob"), ToolCategory::Glob);
        assert_eq!(categorize_tool_name("Task"), ToolCategory::Task);
        assert_eq!(categorize_tool_name("Agent"), ToolCategory::Task);
        assert_eq!(categorize_tool_name("Skill"), ToolCategory::Tool);
        assert_eq!(categorize_tool_name("WebFetch"), ToolCategory::Web);
        assert_eq!(categorize_tool_name("WebSearch"), ToolCategory::Web);
    }

    #[test]
    fn claude_code_task_and_team_tools() {
        assert_eq!(categorize_tool_name("TaskCreate"), ToolCategory::Task);
        assert_eq!(categorize_tool_name("TaskUpdate"), ToolCategory::Task);
        assert_eq!(categorize_tool_name("TaskList"), ToolCategory::Task);
        assert_eq!(categorize_tool_name("TaskGet"), ToolCategory::Task);
        assert_eq!(categorize_tool_name("TaskStop"), ToolCategory::Task);
        assert_eq!(categorize_tool_name("TaskOutput"), ToolCategory::Task);
        assert_eq!(categorize_tool_name("TeamCreate"), ToolCategory::Task);
        assert_eq!(categorize_tool_name("TeamDelete"), ToolCategory::Task);
        assert_eq!(categorize_tool_name("SendMessage"), ToolCategory::Task);
    }

    #[test]
    fn claude_code_utility_tools() {
        assert_eq!(categorize_tool_name("ToolSearch"), ToolCategory::Tool);
        assert_eq!(categorize_tool_name("LSP"), ToolCategory::Tool);
        assert_eq!(categorize_tool_name("TodoWrite"), ToolCategory::Tool);
        assert_eq!(categorize_tool_name("AskUserQuestion"), ToolCategory::Tool);
        assert_eq!(
            categorize_tool_name("ListMcpResourcesTool"),
            ToolCategory::Tool
        );
        assert_eq!(
            categorize_tool_name("ReadMcpResourceTool"),
            ToolCategory::Tool
        );
        assert_eq!(categorize_tool_name("EnterPlanMode"), ToolCategory::Tool);
        assert_eq!(categorize_tool_name("ExitPlanMode"), ToolCategory::Tool);
        assert_eq!(categorize_tool_name("EnterWorktree"), ToolCategory::Tool);
        assert_eq!(categorize_tool_name("ExitWorktree"), ToolCategory::Tool);
    }

    #[test]
    fn claude_code_cron_tools() {
        assert_eq!(categorize_tool_name("CronCreate"), ToolCategory::Cron);
        assert_eq!(categorize_tool_name("CronDelete"), ToolCategory::Cron);
        assert_eq!(categorize_tool_name("CronList"), ToolCategory::Cron);
    }

    #[test]
    fn unknown_tool() {
        assert_eq!(categorize_tool_name("foobar"), ToolCategory::Other);
        assert_eq!(categorize_tool_name(""), ToolCategory::Other);
        assert_eq!(categorize_tool_name("SomeRandomTool"), ToolCategory::Other);
    }
}
