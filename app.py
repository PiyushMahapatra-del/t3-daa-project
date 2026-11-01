"""
app.py — Flask backend for Delivery Optimizer
Calls the C++ binary (bin/optimizer.exe on Windows) with JSON on stdin,
reads JSON from stdout.
"""
import subprocess, json, os, sys
from flask import Flask, request, jsonify, render_template

app = Flask(__name__)

# ── Path to compiled binary ────────────────────────────────────────────────
BASE  = os.path.dirname(os.path.abspath(__file__))
BIN   = os.path.join(BASE, "bin", "optimizer.exe" if sys.platform == "win32" else "optimizer")

def call_cpp(command: str, payload: dict) -> dict:
    """Call the C++ binary and return parsed JSON output."""
    if not os.path.exists(BIN):
        return {"error": f"Binary not found at {BIN}. Please run build.bat first."}
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

# ── Routes ─────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/generate", methods=["POST"])
def generate():
    data = request.json or {}
    return jsonify(call_cpp("generate", {
        "n":    data.get("n", 10),
        "seed": data.get("seed", 42)
    }))

@app.route("/api/shortest", methods=["POST"])
def shortest():
    data = request.json or {}
    return jsonify(call_cpp("shortest", {
        "n":    data.get("n", 10),
        "seed": data.get("seed", 42),
        "src":  data.get("src", 0),
        "dst":  data.get("dst", 1)
    }))

@app.route("/api/tsp", methods=["POST"])
def tsp():
    data = request.json or {}
    return jsonify(call_cpp("tsp", {
        "n":     data.get("n", 10),
        "seed":  data.get("seed", 42),
        "depot": data.get("depot", 0),
        "stops": data.get("stops", []),
        "algo":  data.get("algo", "greedy")
    }))

@app.route("/api/assign", methods=["POST"])
def assign():
    data = request.json or {}
    return jsonify(call_cpp("assign", {
        "orders":  data.get("orders", []),
        "drivers": data.get("drivers", [])
    }))

@app.route("/api/benchmark", methods=["POST"])
def benchmark():
    data = request.json or {}
    return jsonify(call_cpp("benchmark", {
        "sizes": data.get("sizes", [5, 10, 20, 50])
    }))

@app.route("/api/knapsack", methods=["POST"])
def knapsack():
    data = request.json or {}
    return jsonify(call_cpp("knapsack", {
        "weights":  data.get("weights", []),
        "values":   data.get("values", []),
        "capacity": data.get("capacity", 100)
    }))

if __name__ == "__main__":
    app.run(debug=True, port=5000)
