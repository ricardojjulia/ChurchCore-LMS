#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = process.cwd();
const FACTORY_DIR = path.join(ROOT, ".ai-factory");
const RUNS_DIR = path.join(FACTORY_DIR, "runs");
const CONFIG_PATH = path.join(FACTORY_DIR, "factory.config.json");
const LOCKS_DIR = path.join(FACTORY_DIR, "locks");
const activeLocks = [];

const STATES = {
  REQUESTED: "REQUESTED",
  PLANNED: "PLANNED",
  IMPLEMENTED: "IMPLEMENTED",
  TESTED_FAILED: "TESTED_FAILED",
  TESTED_PASSED: "TESTED_PASSED",
  REPAIR_REQUESTED: "REPAIR_REQUESTED",
  REVIEWED: "REVIEWED",
  READY_FOR_PR: "READY_FOR_PR",
  BLOCKED: "BLOCKED"
};

function main() {
  const args = process.argv.slice(2);
  const command = args.shift();
  const dryRun = consumeFlag(args, "--dry-run");

  try {
    switch (command) {
      case "run":
        createRun(args.join(" "), dryRun);
        break;
      case "plan":
        phase(args[0], "plan", dryRun);
        break;
      case "implement":
        phase(args[0], "implement", dryRun);
        break;
      case "test":
        phase(args[0], "test", dryRun);
        break;
      case "review":
        phase(args[0], "review", dryRun);
        break;
      case "status":
        status();
        break;
      case "help":
      case undefined:
        help();
        break;
      default:
        fail(`Unknown command: ${command}`);
    }
  } catch (error) {
    fail(error.message);
  }
}

function consumeFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

function createRun(request, dryRun) {
  ensureFactory();
  if (!request.trim()) fail('Usage: node scripts/factory.js run "Fix X" [--dry-run]');

  const now = new Date();
  const runId = `${formatDate(now)}-${slugify(request)}`;
  const runDir = path.join(RUNS_DIR, runId);

  if (fs.existsSync(runDir)) fail(`Run already exists: ${runId}`);
  fs.mkdirSync(runDir, { recursive: true });

  const requestTemplate = readText(path.join(FACTORY_DIR, "templates", "task-request.md"));
  const requestDoc = requestTemplate
    .replaceAll("{{REQUEST}}", request)
    .replaceAll("{{RUN_ID}}", runId)
    .replaceAll("{{CREATED_AT}}", now.toISOString());

  writeText(path.join(runDir, "request.md"), requestDoc);
  writeJson(path.join(runDir, "state.json"), {
    runId,
    state: STATES.REQUESTED,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    dryRun,
    repairLoops: 0
  });

  console.log(`Created run: ${runId}`);
  console.log(`Run folder: ${relative(runDir)}`);

  phase(runId, "plan", dryRun);
}

function phase(runId, phaseName, dryRun) {
  ensureFactory();
  if (!runId) fail(`Usage: node scripts/factory.js ${phaseName} <run-id> [--dry-run]`);

  const runDir = path.join(RUNS_DIR, runId);
  if (!fs.existsSync(runDir)) fail(`Run not found: ${runId}`);

  const config = readConfig();
  runLivePreflight(config, dryRun);

  const phaseConfig = getPhaseConfig(phaseName);
  const prompt = assemblePrompt(runDir, phaseName);
  const promptPath = path.join(runDir, phaseConfig.promptFile);
  writeText(promptPath, prompt);

  if (dryRun) {
    writeText(
      path.join(runDir, phaseConfig.outputFile),
      dryRunOutput(phaseName, phaseConfig.outputFile)
    );
    updateState(runDir, phaseConfig.dryRunState);
    console.log(`Dry run wrote ${relative(promptPath)}`);
    console.log(`Dry run wrote ${relative(path.join(runDir, phaseConfig.outputFile))}`);
    return;
  }

  const lock = acquireBranchLock(config, runId, phaseName);
  try {
    const agent = config.agents[phaseConfig.agent];
    if (!agent) fail(`Missing agent config for ${phaseConfig.agent}`);
    assertCommandExists(agent.command);

    const result = spawnSync(agent.command, agent.args || [], {
      input: prompt,
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20
    });

    const output = [
      `# ${title(phaseName)} Output`,
      "",
      `Command: \`${[agent.command].concat(agent.args || []).join(" ")}\``,
      `Exit code: ${result.status}`,
      "",
      "## STDOUT",
      "",
      result.stdout || "",
      "",
      "## STDERR",
      "",
      result.stderr || ""
    ].join("\n");

    writeText(path.join(runDir, phaseConfig.outputFile), output);
    if (result.status !== 0) {
      updateState(runDir, STATES.BLOCKED);
      fail(`${agent.name || agent.command} exited with ${result.status}. See ${relative(path.join(runDir, phaseConfig.outputFile))}`);
    }

    updateState(runDir, phaseConfig.successState);
    console.log(`Wrote ${relative(path.join(runDir, phaseConfig.outputFile))}`);
  } finally {
    releaseLock(lock);
  }
}

function getPhaseConfig(phaseName) {
  const phases = {
    plan: {
      agent: "planner",
      promptFile: "codex-plan-prompt.md",
      outputFile: "plan.md",
      dryRunState: STATES.PLANNED,
      successState: STATES.PLANNED
    },
    implement: {
      agent: "implementer",
      promptFile: "claude-implementation-prompt.md",
      outputFile: "implementation-summary.md",
      dryRunState: STATES.IMPLEMENTED,
      successState: STATES.IMPLEMENTED
    },
    test: {
      agent: "tester",
      promptFile: "gemini-test-prompt.md",
      outputFile: "test-report.md",
      dryRunState: STATES.TESTED_PASSED,
      successState: STATES.TESTED_PASSED
    },
    review: {
      agent: "planner",
      promptFile: "codex-review-prompt.md",
      outputFile: "review.md",
      dryRunState: STATES.REVIEWED,
      successState: STATES.REVIEWED
    }
  };

  if (!phases[phaseName]) fail(`Unsupported phase: ${phaseName}`);
  return phases[phaseName];
}

function assemblePrompt(runDir, phaseName) {
  const files = [];
  files.push(["Factory README", path.join(FACTORY_DIR, "README.md")]);
  for (const rule of ["engineering.md", "architecture.md", "testing.md", "security.md"]) {
    files.push([`Rule: ${rule}`, path.join(FACTORY_DIR, "rules", rule)]);
  }

  const templateByPhase = {
    plan: "codex-plan-prompt.md",
    implement: "claude-implementation-prompt.md",
    test: "gemini-test-prompt.md",
    review: "codex-review-prompt.md"
  };

  files.push(["Phase Template", path.join(FACTORY_DIR, "templates", templateByPhase[phaseName])]);

  for (const artifact of [
    "request.md",
    "plan.md",
    "adr-impact.md",
    "implementation-brief.md",
    "implementation-summary.md",
    "diff.patch",
    "test-report.md",
    "repair-brief.md"
  ]) {
    const artifactPath = path.join(runDir, artifact);
    if (fs.existsSync(artifactPath)) files.push([`Run Artifact: ${artifact}`, artifactPath]);
  }

  return files
    .map(([label, filePath]) => `# ${label}\n\n${readText(filePath).trim()}\n`)
    .join("\n---\n\n");
}

function status() {
  ensureFactory();
  if (!fs.existsSync(RUNS_DIR)) {
    console.log("No runs yet.");
    return;
  }

  const entries = fs.readdirSync(RUNS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const statePath = path.join(RUNS_DIR, entry.name, "state.json");
      if (!fs.existsSync(statePath)) return `${entry.name}: UNKNOWN`;
      const state = JSON.parse(readText(statePath));
      return `${entry.name}: ${state.state} updated ${state.updatedAt}`;
    });

  if (entries.length === 0) {
    console.log("No runs yet.");
    return;
  }

  console.log(entries.join("\n"));
}

function dryRunOutput(phaseName, outputFile) {
  return [
    `# Dry Run ${title(phaseName)} Output`,
    "",
    `This placeholder was written to \`${outputFile}\` without invoking an external agent CLI.`,
    "",
    "Review the generated prompt in this run folder before executing live mode."
  ].join("\n");
}

function updateState(runDir, nextState) {
  const statePath = path.join(runDir, "state.json");
  const current = JSON.parse(readText(statePath));
  current.state = nextState;
  current.updatedAt = new Date().toISOString();
  writeJson(statePath, current);
}

function runLivePreflight(config, dryRun) {
  if (dryRun) return;
  requireGitIfConfigured(config);
  requireGitHubRemoteIfConfigured(config);
  requireGitHubCliAuthIfConfigured(config);
}

function requireGitIfConfigured(config) {
  const gitConfig = config.git || {};
  if (!gitConfig.requireGitRepo && !gitConfig.requireGitHubRemote) return;
  if (!isGitRepo()) fail("This factory is configured to require a git repository.");
}

function requireGitHubRemoteIfConfigured(config) {
  const gitConfig = config.git || {};
  if (!gitConfig.requireGitHubRemote) return;
  if (!isGitRepo()) fail("GitHub remote check requires a git repository.");

  const remoteName = gitConfig.remoteName || "origin";
  const result = spawnSync("git", ["remote", "get-url", remoteName], {
    cwd: ROOT,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    fail(`Missing git remote '${remoteName}'. Add a GitHub remote before running live agents.`);
  }

  const remoteUrl = result.stdout.trim();
  if (!isGitHubRemote(remoteUrl)) {
    fail(`Remote '${remoteName}' is not a GitHub URL: ${remoteUrl}`);
  }
}

function requireGitHubCliAuthIfConfigured(config) {
  const gitConfig = config.git || {};
  if (!gitConfig.requireGitHubCliAuth) return;
  assertCommandExists("gh");

  const result = spawnSync("gh", ["auth", "status"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
  if (result.status !== 0) {
    fail("GitHub CLI is not authenticated. Run `gh auth login` before live factory phases.");
  }
}

function isGitRepo() {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  return result.status === 0;
}

function isGitHubRemote(remoteUrl) {
  return /^git@github\.com:/.test(remoteUrl) || /^https:\/\/github\.com\//.test(remoteUrl);
}

function acquireBranchLock(config, runId, phaseName) {
  if (config.locks && config.locks.enabled === false) return null;
  const branch = currentBranchName();
  const lockName = safeLockName(branch);
  const lockPath = path.join(LOCKS_DIR, `${lockName}.json`);
  const staleAfterMinutes = Number(config.locks && config.locks.staleAfterMinutes) || 120;
  const staleAfterMs = staleAfterMinutes * 60 * 1000;

  fs.mkdirSync(LOCKS_DIR, { recursive: true });
  clearInactiveLock(lockPath, staleAfterMs);

  const lock = {
    branch,
    runId,
    phase: phaseName,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    cwd: ROOT
  };

  try {
    const fd = fs.openSync(lockPath, "wx");
    fs.writeFileSync(fd, JSON.stringify(lock, null, 2));
    fs.closeSync(fd);
    activeLocks.push(lockPath);
    console.log(`Acquired branch lock: ${relative(lockPath)}`);
    return lockPath;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = readLock(lockPath);
    fail([
      `Branch is already locked: ${branch}`,
      `Lock file: ${relative(lockPath)}`,
      `Owner: run ${existing.runId || "unknown"}, phase ${existing.phase || "unknown"}, pid ${existing.pid || "unknown"}`,
      "Wait for that phase to finish before starting another live agent on this branch."
    ].join("\n"));
  }
}

function clearInactiveLock(lockPath, staleAfterMs) {
  if (!fs.existsSync(lockPath)) return;
  const lock = readLock(lockPath);
  const startedAt = Date.parse(lock.startedAt || "");
  const isStale = Number.isNaN(startedAt) || Date.now() - startedAt > staleAfterMs;
  const isDead = lock.pid ? !isProcessAlive(lock.pid) : true;
  if (isStale || isDead) fs.unlinkSync(lockPath);
}

function readLock(lockPath) {
  try {
    return JSON.parse(readText(lockPath));
  } catch (_error) {
    return {};
  }
}

function releaseLock(lockPath) {
  if (!lockPath || !fs.existsSync(lockPath)) return;
  const lock = readLock(lockPath);
  if (lock.pid && lock.pid !== process.pid) return;
  fs.unlinkSync(lockPath);
  const index = activeLocks.indexOf(lockPath);
  if (index !== -1) activeLocks.splice(index, 1);
  console.log(`Released branch lock: ${relative(lockPath)}`);
}

function currentBranchName() {
  const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  if (result.status === 0) return result.stdout.trim() || "detached";
  return `workspace-${path.basename(ROOT)}`;
}

function safeLockName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "branch";
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function assertCommandExists(command) {
  const result = spawnSync("command", ["-v", command], {
    cwd: ROOT,
    shell: true,
    encoding: "utf8"
  });
  if (result.status !== 0) fail(`Command not found: ${command}`);
}

function ensureFactory() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fail("Missing .ai-factory/factory.config.json. Run this from the scaffold root.");
  }
  fs.mkdirSync(RUNS_DIR, { recursive: true });
}

function readConfig() {
  return JSON.parse(readText(CONFIG_PATH));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${content.trimEnd()}\n`, "utf8");
}

function writeJson(filePath, value) {
  writeText(filePath, JSON.stringify(value, null, 2));
}

function slugify(input) {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "task";
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}-${hour}${minute}${second}`;
}

function relative(filePath) {
  return path.relative(ROOT, filePath);
}

function title(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function help() {
  console.log(`Usage:
  node scripts/factory.js run "Fix X" [--dry-run]
  node scripts/factory.js plan <run-id> [--dry-run]
  node scripts/factory.js implement <run-id> [--dry-run]
  node scripts/factory.js test <run-id> [--dry-run]
  node scripts/factory.js review <run-id> [--dry-run]
  node scripts/factory.js status`);
}

process.on("exit", () => {
  for (const lockPath of [...activeLocks]) releaseLock(lockPath);
});

process.on("SIGINT", () => {
  process.exit(130);
});

process.on("SIGTERM", () => {
  process.exit(143);
});

function fail(message) {
  console.error(message);
  process.exit(1);
}

main();
