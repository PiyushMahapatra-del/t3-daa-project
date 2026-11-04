# DeliverOpt India: Intelligent Delivery and Route Optimization

A web app that plans deliveries across **40 real Indian cities** on a **real map**, using classic DAA algorithms. The algorithms are written in **C++**, with an identical **pure-Python fallback** so the project runs without a compiler.

## Features

| Feature | Algorithm | Time complexity |
|---|---|---|
| Shortest route between two cities | Dijkstra (min-heap) | O((V+E) log V) |
| Quick delivery tour | Nearest Neighbour (greedy) | O(n²) |
| Better delivery tour | 2-Opt (local search) | O(n²) per pass |
| Exact delivery tour (up to 12 stops) | Held-Karp (bitmask DP) | O(2ⁿ · n²) |
| Order-to-driver assignment | Priority queue + greedy | O(n log n + n·d) |
| Best truck load | 0/1 Knapsack (DP) | O(n · W) |
| Algorithm comparison | Timed benchmarks with charts | n/a |

*V = cities, E = roads, n = stops or items, d = drivers, W = vehicle capacity.*

## Quick start (Windows)

You only need Python 3.9 or newer.

```bat
git clone https://github.com/agamya101/t3-daa-project.git
cd t3-daa-project
pip install flask
py app.py
```

Open **http://localhost:5000**. The header badge shows **Python engine**.

### Optional: use the C++ engine

Install [CMake](https://cmake.org/download/) and [MinGW-w64](https://winlibs.com/) (both on PATH), then:

```bat
build.bat
py app.py
```

`build.bat` compiles `bin/optimizer.exe`. On the next start, Flask detects it and the badge changes to **C++ engine**. Results are identical in both modes.

## How it works

```
Browser (HTML, CSS, JavaScript, Leaflet map)
   |  POST /api/<feature>  (JSON)
   v
Flask (app.py), a thin bridge with no algorithm inside
   |-- bin/optimizer.exe found --> C++ engine (subprocess, JSON via stdin/stdout)
   '-- otherwise ---------------> algorithms.py (same logic in Python)
   |
   v
JSON result --> JavaScript draws routes on the map and fills the panels
```

The server keeps no state. Every request rebuilds the same road network from the number of cities, so results are repeatable.

## The road network

- **Cities:** the first *n* of 40 real Indian cities with latitude and longitude (the slider picks *n*, 5 to 40).
- **Roads:** each city is linked to its 3 nearest neighbours. Shortest bridging links are added until the graph is connected.
- **Distance:** straight-line (haversine) km × 1.3 road factor, rounded to 0.1 km.
- **Storage:** adjacency list, O(V+E) space.
- **TSP distances:** the tour planners use Dijkstra to get the shortest distance between every pair of stops.

## Using the app

1. **Route Planner:** choose how many cities to show, find the shortest route between two cities, and plan a multi-stop tour from a depot (tap city chips or map markers to pick stops). Results show distance, drive time and fuel cost.
2. **Orders and Drivers:** add orders (pickup, drop, weight, priority) and drivers (capacity), then assign. Urgent orders are served first.
3. **Load Planner:** enter packages (weight, value) and a vehicle capacity to get the best-value load.
4. **Benchmarks:** compare Nearest Neighbour, 2-Opt and Held-Karp on random test networks (tour length and run time, log scale).

Time and fuel figures are estimates based on 55 km/h average speed and ₹12 per km. Both constants are at the top of `static/js/app.js`.

## API

All routes are `POST` with a JSON body, and return JSON. `GET /api/mode` returns `{"mode": "cpp" | "python"}`.

| Route | Request | Returns |
|---|---|---|
| `/api/generate` | `{n}` | cities (name, state, lat, lng), roads |
| `/api/shortest` | `{n, src, dst}` | path, cost in km |
| `/api/tsp` | `{n, depot, stops, algo}` where algo is `greedy`, `2opt` or `dp` | tour order, cost |
| `/api/assign` | `{orders, drivers}` | assignments, driver loads |
| `/api/knapsack` | `{weights, values, capacity}` | selected items, best value |
| `/api/benchmark` | `{sizes}` | timings and costs per size |

## Project structure

```
t3-daa-project/
├── cpp/
│   ├── include/             Order, Driver, Graph, Optimizer headers
│   ├── src/
│   │   ├── core/            order_manager.cpp: priority queue and driver assignment
│   │   ├── routing/         graph.cpp, dijkstra.cpp, tsp.cpp
│   │   └── analysis/        benchmark.cpp, comparator.cpp (Knapsack, benchmarks)
│   ├── main.cpp             reads a command and JSON, builds the city graph, prints JSON
│   └── CMakeLists.txt
├── algorithms.py            Python mirror of every C++ algorithm
├── app.py                   Flask routes
├── templates/index.html     interface
├── static/css/style.css
├── static/js/app.js         map (Leaflet), forms, charts (Chart.js)
├── build.bat                builds the C++ engine
├── run.bat                  launch script
└── requirements.txt         flask
```

## Team split

| Member | Area | Files |
|---|---|---|
| 1 | Orders and drivers | `cpp/src/core/` |
| 2 | Graph, Dijkstra, TSP heuristics | `cpp/src/routing/` |
| 3 | Held-Karp, Knapsack, benchmarks | `cpp/src/analysis/` |

## Limitations

- Distances are approximate (straight-line × 1.3), not real road distances.
- Map routes are drawn between cities along the network links, not along real road geometry.
- Held-Karp is limited to 12 delivery stops because its cost grows as 2ⁿ.
- Driver assignment is a greedy heuristic and may not be the best possible assignment.
- Benchmarks run on random test networks, not on the Indian city graph.
- The map needs an internet connection to load OpenStreetMap tiles.

## Tech stack

C++17 · CMake · nlohmann/json · Python 3 · Flask · Leaflet · OpenStreetMap · Chart.js
