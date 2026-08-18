CREATE TRIGGER IF NOT EXISTS foundry_guard_task_initiative_insert
BEFORE INSERT ON tasks
WHEN (SELECT id FROM initiatives WHERE id = NEW.initiativeId) IS NULL
BEGIN SELECT RAISE(ABORT, 'task initiative does not exist'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS foundry_guard_task_event_task_insert
BEFORE INSERT ON task_events
WHEN (SELECT id FROM tasks WHERE id = NEW.taskId) IS NULL
BEGIN SELECT RAISE(ABORT, 'task event task does not exist'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS foundry_guard_task_attempt_task_insert
BEFORE INSERT ON task_attempts
WHEN (SELECT id FROM tasks WHERE id = NEW.taskId) IS NULL
BEGIN SELECT RAISE(ABORT, 'task attempt task does not exist'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS foundry_guard_task_evidence_task_insert
BEFORE INSERT ON task_evidence
WHEN (SELECT id FROM tasks WHERE id = NEW.taskId) IS NULL
BEGIN SELECT RAISE(ABORT, 'task evidence task does not exist'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS foundry_guard_task_approval_task_insert
BEFORE INSERT ON task_approvals
WHEN (SELECT id FROM tasks WHERE id = NEW.taskId) IS NULL
BEGIN SELECT RAISE(ABORT, 'task approval task does not exist'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS foundry_guard_session_control_task_insert
BEFORE INSERT ON session_controls
WHEN (SELECT id FROM tasks WHERE id = NEW.taskId) IS NULL
BEGIN SELECT RAISE(ABORT, 'session control task does not exist'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS foundry_guard_monitor_checkpoint_task_insert
BEFORE INSERT ON session_monitor_checkpoints
WHEN (SELECT id FROM tasks WHERE id = NEW.taskId) IS NULL
BEGIN SELECT RAISE(ABORT, 'monitor checkpoint task does not exist'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS foundry_guard_control_lease_task_insert
BEFORE INSERT ON task_control_leases
WHEN (SELECT id FROM tasks WHERE id = NEW.taskId) IS NULL
BEGIN SELECT RAISE(ABORT, 'control lease task does not exist'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS foundry_guard_quality_contract_initiative_insert
BEFORE INSERT ON quality_contracts
WHEN (SELECT id FROM initiatives WHERE id = NEW.initiativeId) IS NULL
BEGIN SELECT RAISE(ABORT, 'quality contract initiative does not exist'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS foundry_guard_quality_prompt_task_insert
BEFORE INSERT ON quality_prompts
WHEN (SELECT id FROM tasks WHERE id = NEW.taskId) IS NULL
BEGIN SELECT RAISE(ABORT, 'quality prompt task does not exist'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS foundry_guard_quality_verification_task_insert
BEFORE INSERT ON quality_verifications
WHEN (SELECT id FROM tasks WHERE id = NEW.taskId) IS NULL
BEGIN SELECT RAISE(ABORT, 'quality verification task does not exist'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS foundry_guard_quality_recovery_task_insert
BEFORE INSERT ON quality_recoveries
WHEN (SELECT id FROM tasks WHERE id = NEW.taskId) IS NULL
BEGIN SELECT RAISE(ABORT, 'quality recovery task does not exist'); END;
