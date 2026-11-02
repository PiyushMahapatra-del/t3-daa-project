"""
app.py — Flask backend for Delivery Optimizer
Primary:  calls the compiled C++ binary (bin/optimizer.exe on Windows).
Fallback: uses algorithms.py (pure Python) when binary is not built yet.
          → Run with just:  pip install flask && python app.py
"""
import subprocess, json, os, sys
from flask import Flask, request, jsonify, render_template

app = Flask(__name__)

# ── Path to compiled binary ────────────────────────────────────────────────
BASE  = os.path.dirname(os.path.abspath(__file__))
BIN   = os.path.join(BASE, "bin", "optimizer.exe" if sys.platform == "win32" else "optimizer")

# ── Detect mode at startup ─────────────────────────────────────────────────
USE_CPP = os.path.exists(BIN)
if USE_CPP:
    print(f"[optimizer] C++ mode  → {BIN}")
else:
    print("[optimizer] Python fallback mode (C++ binary not found — run build.bat to enable C++ mode)")
    from algorithms import run_command as py_run

def call_cpp(command: str, payload: dict) -> dict:
    """Call the C++ binary and return parsed JSON output."""
    try:
        result = subprocess.run(
            [BIN, command],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            timeout=30
        )
        if result.returncode != 0 and result.stderr:
            return {"error": result.stderr.strip()}
        return json.loads(result.stdout.strip())
    except subprocess.TimeoutExpired:
        return {"error": "C++ binary timed out"}
    except json.JSONDecodeError as e:
        return {"error": f"JSON parse error: {e}", "raw": result.stdout[:500]}
    except Exception as e:
        return {"error": str(e)}

def run(command: str, payload: dict) -> dict:
    """Route to C++ binary or Python fallback."""
    if USE_CPP:
        return call_cpp(command, payload)
    return py_run(command, payload)

# ── Routes ─────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/status", methods=["GET"])
def status():
    return jsonify({
        "status": "online",
        "mode": "C++ Native" if USE_CPP else "Python JIT Fallback",
        "binary_path": BIN if USE_CPP else None,
        "platform": sys.platform
    })

@app.route("/api/generate", methods=["POST"])
def generate():
    data = request.json or {}
    return jsonify(run("generate", {
        "n":    data.get("n", 10),
        "seed": data.get("seed", 42)
    }))

@app.route("/api/shortest", methods=["POST"])
def shortest():
    data = request.json or {}
    return jsonify(run("shortest", {
        "n":    data.get("n", 10),
        "seed": data.get("seed", 42),
        "src":  data.get("src", 0),
        "dst":  data.get("dst", 1)
    }))

@app.route("/api/tsp", methods=["POST"])
def tsp():
    data = request.json or {}
    return jsonify(run("tsp", {
        "n":     data.get("n", 10),
        "seed":  data.get("seed", 42),
        "depot": data.get("depot", 0),
        "stops": data.get("stops", []),
        "algo":  data.get("algo", "greedy")
    }))

@app.route("/api/assign", methods=["POST"])
def assign():
    data = request.json or {}
    return jsonify(run("assign", {
        "orders":  data.get("orders", []),
        "drivers": data.get("drivers", [])
    }))

@app.route("/api/benchmark", methods=["POST"])
def benchmark():
    data = request.json or {}
    return jsonify(run("benchmark", {
        "sizes": data.get("sizes", [5, 10, 20, 50])
    }))

@app.route("/api/knapsack", methods=["POST"])
def knapsack():
    data = request.json or {}
    return jsonify(run("knapsack", {
        "weights":  data.get("weights", []),
        "values":   data.get("values", []),
        "capacity": data.get("capacity", 100)
    }))

if __name__ == "__main__":
    app.run(debug=True, port=5000)
