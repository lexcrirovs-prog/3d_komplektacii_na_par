"""Own one isolated Blender process for each MCP connection."""
import atexit
import json
import os
from pathlib import Path
import queue
import subprocess
import threading
import time
import uuid

PREFIX = "BLENDER_BRIDGE_RESPONSE:"


class BlenderBridge:
    def __init__(self, blender, assets, runtime, timeout=150):
        self.blender = Path(blender).resolve()
        self.assets = Path(assets).resolve()
        self.runtime = Path(runtime).resolve()
        self.timeout = timeout
        self.process = None
        self.responses = queue.Queue()
        self.lock = threading.Lock()
        self.failed = False
        self.runtime.mkdir(parents=True, exist_ok=True)
        self.outputs = self.runtime / "outputs"
        self.outputs.mkdir(exist_ok=True)
        self.log = None
        self.stderr = None
        self.reader = None
        atexit.register(self.close)

    def _start(self):
        if not self.blender.is_file() or not self.assets.is_dir():
            raise RuntimeError("Configured Blender executable or asset directory is missing")
        logs = self.runtime / "logs"
        logs.mkdir(exist_ok=True)
        identity = uuid.uuid4().hex[:12]
        self.log = (logs / f"blender-{identity}.log").open("a", encoding="utf-8")
        self.stderr = (logs / f"blender-{identity}.stderr.log").open("a", encoding="utf-8")
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        args = [str(self.blender), "--background", "--factory-startup", "--disable-autoexec",
                "--python", str(Path(__file__).with_name("worker.py")), "--",
                "--assets", str(self.assets), "--outputs", str(self.outputs)]
        self.process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=self.stderr, text=True, encoding="utf-8", errors="replace",
                                        env=env, cwd=str(self.runtime),
                                        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)

        def read_output():
            try:
                for line in self.process.stdout:
                    if line.startswith(PREFIX):
                        try:
                            self.responses.put(json.loads(line[len(PREFIX):]))
                        except ValueError:
                            self.responses.put({"protocol_error": True})
                    else:
                        self.log.write(line)
                        self.log.flush()
            finally:
                self.responses.put(None)

        self.reader = threading.Thread(target=read_output, daemon=True)
        self.reader.start()

    def call(self, operation, **params):
        with self.lock:
            if self.failed:
                raise RuntimeError("The Blender session is unavailable or its last operation is uncertain. Reconnect and inspect a saved scene; do not repeat a write automatically.")
            if self.process is None:
                self._start()
            identity = uuid.uuid4().hex
            payload = json.dumps({"id": identity, "operation": operation, "params": params}, ensure_ascii=False, allow_nan=False)
            try:
                self.process.stdin.write(payload + "\n")
                self.process.stdin.flush()
                deadline = time.monotonic() + self.timeout
                while True:
                    response = self.responses.get(timeout=max(0.01, deadline - time.monotonic()))
                    if response is None or response.get("protocol_error"):
                        raise ConnectionError("Blender worker closed or returned an invalid response")
                    if response.get("id") != identity:
                        raise ConnectionError("Unexpected Blender response identity")
                    break
            except (OSError, queue.Empty, ConnectionError) as exc:
                self.failed = True
                raise RuntimeError("Blender operation outcome is uncertain; no retry was performed") from exc
            if not response.get("ok"):
                suffix = " Inspect the scene before any new write; the operation may have partially applied." if response.get("mutation_may_have_applied") else ""
                raise ValueError(response.get("error", "Blender operation failed") + suffix)
            return response["result"]

    def close(self):
        process = self.process
        if process is None:
            return
        try:
            if process.stdin and not process.stdin.closed:
                process.stdin.close()
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                # Only the background child created by this bridge is eligible.
                process.terminate()
                process.wait(timeout=5)
            if self.reader:
                self.reader.join(timeout=2)
        finally:
            if process.stdout:
                process.stdout.close()
            if self.log:
                self.log.close()
            if self.stderr:
                self.stderr.close()
            self.process = None


if __name__ == "__main__":
    raise SystemExit("Run server.py to use the MCP interface")
