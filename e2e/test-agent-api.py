#!/usr/bin/env python3
"""
E2E Test: feat-010 Agent API Programming Interface Layer
Tests that window.todoApi provides a clean programming interface
for external agents to manipulate todos, without any UI panel.
"""

import subprocess
import os
import sys

# ── Test Runner ──────────────────────────────────────

tests_passed = 0
tests_failed = 0

def test(name, condition, detail=""):
    global tests_passed, tests_failed
    if condition:
        tests_passed += 1
        print(f"  PASS {name}")
    else:
        tests_failed += 1
        print(f"  FAIL {name} — {detail}")

def read_file_safe(path):
    """Read file content, return empty string on error"""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        return ""

print("=" * 60)
print("E2E Test: feat-010 Agent API Programming Interface Layer")
print("=" * 60)

# ── Test 1: Verify API module exists and structure ───
print("\n[1/6] API Module Structure")

api_source = read_file_safe('src/todo-api.ts')
test("todo-api.ts exists", len(api_source) > 0)
test("exports TodoAgentAPI class", 'class TodoAgentAPI' in api_source)
test("exports todoApi instance", 'export const todoApi = new TodoAgentAPI()' in api_source)
test("exports processAgentInput compat", 'processAgentInput' in api_source)

# ── Test 2: Verify UI panel removed from App.tsx ─────
print("\n[2/6] UI Panel Removed")

app_source = read_file_safe('src/App.tsx')
css_source = read_file_safe('src/index.css')

# AgentPanel component definition should be gone
test("AgentPanel component removed", 
     'function AgentPanel' not in app_source)
# agentResult state should be gone (it was for the UI panel)
test("agentResult state removed",
     'useState<CliResult>' not in app_source and 'agentResult' not in app_source[:2000])
# CSS for .agent-panel should be removed
test(".agent-panel CSS removed", '.agent-panel {' not in css_source)

# ── Test 3: Verify all API methods exist ─────────────
print("\n[3/6] API Methods")

api_methods = [
    ('add', 'add('),
    ('addBatch', 'addBatch('),
    ('get', 'get('),
    ('list', 'list('),
    ('update', 'update('),
    ('complete', 'complete('),
    ('uncomplete', 'uncomplete('),
    ('delete', 'delete('),
    ('completeBatch', 'completeBatch('),
    ('deleteBatch', 'deleteBatch('),
    ('clearCompleted', 'clearCompleted('),
    ('stats', 'stats('),
    ('exec', 'exec('),
    ('onChange', 'onChange('),
    ('help', 'help('),
]

for name, sig in api_methods:
    test(f"has {name}()", sig in api_source)

# ── Test 4: Verify global window exposure ─────────────
print("\n[4/6] Global Window Exposure")

test("exposes window.todoApi", 'window.todoApi = todoApi' in api_source)
test("exposes window.todoAgent", 'window.todoAgent =' in api_source)

# Check todoAgent has exec and help methods
test("todoAgent has exec method", 'exec:' in api_source or 'exec =' in api_source)
test("todoAgent has help method", 'help:' in api_source or 'help =' in api_source)

# ── Test 5: TypeScript compilation ────────────────────
print("\n[5/6] TypeScript Compilation")

result = subprocess.run(
    ['npx', 'tsc', '--noEmit'],
    capture_output=True, text=True, timeout=30, cwd='.'
)

if result.returncode == 0:
    test("TypeScript zero errors", True)
else:
    # Show first few errors
    err_lines = [l for l in result.stderr.strip().split('\n') if l.strip()][:5]
    test("TypeScript zero errors", False, '; '.join(err_lines))

# ── Test 6: Production build ─────────────────────────
print("\n[6/6] Production Build")

result2 = subprocess.run(
    ['npm', 'run', 'build'],
    capture_output=True, text=True, timeout=60, cwd='.'
)

build_ok = result2.returncode == 0 and 'built in' in result2.stdout
if build_ok:
    test("Vite build succeeds", True)
else:
    err = result2.stderr[-300:] if result2.stderr else result2.stdout[-200:]
    test("Vite build succeeds", False, err)

# ── Summary ───────────────────────────────────────────

total = tests_passed + tests_failed
print(f"\n{'=' * 60}")
print(f"Results: {tests_passed}/{total} passed, {tests_failed} failed")
print("=" * 60)

if tests_failed > 0:
    sys.exit(1)
else:
    print("All E2E tests passed!")
    sys.exit(0)
