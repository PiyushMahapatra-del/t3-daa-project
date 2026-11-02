"""
algorithms.py — Pure Python implementations of all delivery optimizer algorithms.
Used as fallback when the C++ binary is not available (no CMake/g++ needed).
"""
import math, random, heapq, json, time
from itertools import combinations

INF = float('inf')

# ── Graph utilities ───────────────────────────────────────────────────────────

def euclidean(x1, y1, x2, y2):
    return round(math.sqrt((x1-x2)**2 + (y1-y2)**2), 1)

def build_random_graph(n, seed=42):
    rng = random.Random(seed)
    CITY_POOL = [
        "Alpha","Bravo","Charlie","Delta","Echo","Foxtrot","Golf","Hotel",
        "India","Juliet","Kilo","Lima","Mike","November","Oscar","Papa",
        "Quebec","Romeo","Sierra","Tango","Uniform","Victor","Whiskey",
        "X-Ray","Yankee","Zulu","Apex","Beacon","Crest","Dune","Eden",
        "Frost","Grove","Haven","Isle","Junction","Knox","Lakeview","Mesa",
        "Nexus","Orbit","Peak","Quay","Ridge","Summit","Tide","Upland",
        "Vale","Wharf","Zenith","Ardent"
    ]
    nodes = []
    for i in range(n):
        nodes.append({
            "id":  CITY_POOL[i % len(CITY_POOL)],
            "idx": i,
            "x":   round(rng.uniform(50, 750), 1),
            "y":   round(rng.uniform(50, 750), 1),
        })
    edges = []
    adj   = [[] for _ in range(n)]
    for i in range(n):
        for j in range(i+1, n):
            w = euclidean(nodes[i]["x"], nodes[i]["y"], nodes[j]["x"], nodes[j]["y"])
            edges.append({"from": i, "to": j, "weight": w})
            adj[i].append((j, w))
            adj[j].append((i, w))
    return nodes, edges, adj

# ── Real Indian road network ──────────────────────────────────────────────────
INDIA = [
    ("Delhi","Delhi",28.6139,77.2090),("Mumbai","Maharashtra",19.0760,72.8777),
    ("Bengaluru","Karnataka",12.9716,77.5946),("Chennai","Tamil Nadu",13.0827,80.2707),
    ("Kolkata","West Bengal",22.5726,88.3639),("Hyderabad","Telangana",17.3850,78.4867),
    ("Ahmedabad","Gujarat",23.0225,72.5714),("Pune","Maharashtra",18.5204,73.8567),
    ("Jaipur","Rajasthan",26.9124,75.7873),("Lucknow","Uttar Pradesh",26.8467,80.9462),
    ("Bhopal","Madhya Pradesh",23.2599,77.4126),("Nagpur","Maharashtra",21.1458,79.0882),
    ("Chandigarh","Chandigarh",30.7333,76.7794),("Patna","Bihar",25.5941,85.1376),
    ("Bhubaneswar","Odisha",20.2961,85.8245),("Guwahati","Assam",26.1445,91.7362),
    ("Kochi","Kerala",9.9312,76.2673),("Visakhapatnam","Andhra Pradesh",17.6868,83.2185),
    ("Indore","Madhya Pradesh",22.7196,75.8577),("Surat","Gujarat",21.1702,72.8311),
    ("Kanpur","Uttar Pradesh",26.4499,80.3319),("Coimbatore","Tamil Nadu",11.0168,76.9558),
    ("Vadodara","Gujarat",22.3072,73.1812),("Amritsar","Punjab",31.6340,74.8723),
    ("Ranchi","Jharkhand",23.3441,85.3096),("Raipur","Chhattisgarh",21.2514,81.6296),
    ("Dehradun","Uttarakhand",30.3165,78.0322),("Jodhpur","Rajasthan",26.2389,73.0243),
    ("Madurai","Tamil Nadu",9.9252,78.1198),("Thiruvananthapuram","Kerala",8.5241,76.9366),
    ("Mysuru","Karnataka",12.2958,76.6394),("Panaji","Goa",15.4909,73.8278),
    ("Varanasi","Uttar Pradesh",25.3176,82.9739),("Agra","Uttar Pradesh",27.1767,78.0081),
    ("Udaipur","Rajasthan",24.5854,73.7125),("Srinagar","J&K",34.0837,74.7973),
    ("Shimla","Himachal Pradesh",31.1048,77.1734),("Vijayawada","Andhra Pradesh",16.5062,80.6480),
    ("Mangaluru","Karnataka",12.9141,74.8560),("Gwalior","Madhya Pradesh",26.2183,78.1828),
]

def haversine_km(la1, lo1, la2, lo2):
    R, D = 6371.0, math.pi / 180.0
    dla, dlo = (la2 - la1) * D, (lo2 - lo1) * D
    a = math.sin(dla/2)**2 + math.cos(la1*D) * math.cos(la2*D) * math.sin(dlo/2)**2
    return 2 * R * math.asin(math.sqrt(a))

def build_india_graph(n, seed=42):
    """First n Indian cities; 3-nearest-neighbour road links (always connected).
    Weight = great-circle km x 1.3 road factor, rounded to 0.1 km."""
    n = max(2, min(n, len(INDIA)))
    nodes = [{"id": INDIA[i][0], "idx": i, "state": INDIA[i][1],
              "lat": INDIA[i][2], "lng": INDIA[i][3],
              "x": INDIA[i][3], "y": INDIA[i][2]} for i in range(n)]
    d = [[round(haversine_km(INDIA[i][2], INDIA[i][3], INDIA[j][2], INDIA[j][3]) * 1.3, 1)
          for j in range(n)] for i in range(n)]
    has = set()
    for i in range(n):
        order = sorted((j for j in range(n) if j != i), key=lambda j: d[i][j])
        for j in order[:min(3, n-1)]:
            has.add((min(i, j), max(i, j)))
    comp = list(range(n))
    def find(x):
        while comp[x] != x:
            comp[x] = comp[comp[x]]
            x = comp[x]
        return x
    for i, j in has:
        comp[find(i)] = find(j)
    while True:
        best, pair = float('inf'), None
        for i in range(n):
            for j in range(i+1, n):
                if find(i) != find(j) and d[i][j] < best:
                    best, pair = d[i][j], (i, j)
        if pair is None:
            break
        has.add(pair)
        comp[find(pair[0])] = find(pair[1])
    edges, adj = [], [[] for _ in range(n)]
    for i, j in sorted(has):
        edges.append({"from": i, "to": j, "weight": d[i][j]})
        adj[i].append((j, d[i][j]))
        adj[j].append((i, d[i][j]))
    return nodes, edges, adj

# ── Member 2: Dijkstra ────────────────────────────────────────────────────────

def dijkstra(adj, n, src):
    dist = [INF] * n
    prev = [-1]  * n
    dist[src] = 0.0
    pq = [(0.0, src)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue
        for v, w in adj[u]:
            nd = dist[u] + w
            if nd < dist[v]:
                dist[v] = nd
                prev[v] = u
                heapq.heappush(pq, (nd, v))
    return dist, prev

def reconstruct_path(prev, dst):
    path = []
    cur = dst
    while cur != -1:
        path.append(cur)
        cur = prev[cur]
    return list(reversed(path))

def path_cost(adj, n, tour):
    total = 0.0
    for i in range(len(tour)-1):
        d, _ = dijkstra(adj, n, tour[i])
        if d[tour[i+1]] == INF:
            return INF
        total += d[tour[i+1]]
    return round(total, 2)

# ── Member 2: TSP Nearest Neighbor ───────────────────────────────────────────

def tsp_nearest_neighbor(adj, n, depot, stops):
    if not stops:
        return [depot]
    unvisited = list(stops)
    tour = [depot]
    cur = depot
    while unvisited:
        d, _ = dijkstra(adj, n, cur)
        best = min(unvisited, key=lambda s: d[s])
        tour.append(best)
        unvisited.remove(best)
        cur = best
    tour.append(depot)
    return tour

# ── Member 2: 2-Opt improvement ──────────────────────────────────────────────

def two_opt(adj, n, tour):
    improved = True
    tour = list(tour)
    while improved:
        improved = False
        for i in range(1, len(tour)-2):
            for j in range(i+1, len(tour)-1):
                d_i,  _ = dijkstra(adj, n, tour[i-1])
                d_j,  _ = dijkstra(adj, n, tour[j])
                before = d_i[tour[i]]   + d_j[tour[j+1]]
                after  = d_i[tour[j]]   + dijkstra(adj, n, tour[i])[0][tour[j+1]]
                if after < before - 1e-9:
                    tour[i:j+1] = reversed(tour[i:j+1])
                    improved = True
    return tour

# ── Member 3: Held-Karp exact TSP DP ─────────────────────────────────────────

def tsp_dp(adj, n, depot, stops):
    if not stops or len(stops) > 12:
        return []
    nodes = [depot] + list(stops)
    N = len(nodes)
    # Precompute pairwise shortest paths
    dist = [[INF]*N for _ in range(N)]
    for i in range(N):
        d, _ = dijkstra(adj, n, nodes[i])
        for j in range(N):
            dist[i][j] = d[nodes[j]]

    m    = len(stops)
    FULL = (1 << m) - 1
    dp     = [[INF]*m for _ in range(1<<m)]
    parent = [[-1]*m  for _ in range(1<<m)]

    for i in range(m):
        dp[1<<i][i] = dist[0][i+1]

    for S in range(1, FULL+1):
        for i in range(m):
            if not (S & (1<<i)) or dp[S][i] == INF:
                continue
            for j in range(m):
                if S & (1<<j):
                    continue
                S2 = S | (1<<j)
                nd = dp[S][i] + dist[i+1][j+1]
                if nd < dp[S2][j]:
                    dp[S2][j] = nd
                    parent[S2][j] = i

    best, last = INF, -1
    for i in range(m):
        c = dp[FULL][i] + dist[i+1][0]
        if c < best:
            best, last = c, i

    if last == -1:
        return []
    order, S, cur = [], FULL, last
    while cur != -1:
        order.append(stops[cur])
        prev = parent[S][cur]
        S ^= (1<<cur)
        cur = prev
    order.reverse()
    return [depot] + order + [depot]

# ── Member 3: 0/1 Knapsack DP ────────────────────────────────────────────────

def knapsack_dp(weights, values, capacity):
    n = len(weights)
    dp = [[0]*(capacity+1) for _ in range(n+1)]
    for i in range(1, n+1):
        for w in range(capacity+1):
            dp[i][w] = dp[i-1][w]
            if weights[i-1] <= w:
                dp[i][w] = max(dp[i][w], dp[i-1][w-weights[i-1]] + values[i-1])
    selected, w = [], capacity
    for i in range(n, 0, -1):
        if dp[i][w] != dp[i-1][w]:
            selected.append(i-1)
            w -= weights[i-1]
    selected.reverse()
    return {
        "max_value":    dp[n][capacity],
        "selected":     selected,
        "total_weight": capacity - w
    }

# ── Member 3: Benchmark ───────────────────────────────────────────────────────

def benchmark_single(n_cities, n_stops, seed=42):
    nodes, edges, adj = build_random_graph(n_cities, seed)
    depot = 0
    stops = list(range(1, min(n_stops+1, n_cities)))

    t0 = time.perf_counter()
    tour_g = tsp_nearest_neighbor(adj, n_cities, depot, stops)
    t1 = time.perf_counter()
    cost_g = path_cost(adj, n_cities, tour_g)

    t2 = time.perf_counter()
    tour_2 = two_opt(adj, n_cities, list(tour_g))
    t3 = time.perf_counter()
    cost_2 = path_cost(adj, n_cities, tour_2)

    dp_cost, dp_ms = -1, -1
    if len(stops) <= 10:
        t4 = time.perf_counter()
        tour_dp = tsp_dp(adj, n_cities, depot, stops)
        t5 = time.perf_counter()
        dp_cost = path_cost(adj, n_cities, tour_dp) if tour_dp else -1
        dp_ms   = round((t5-t4)*1000, 3)

    imp_2opt = round(100*(cost_g-cost_2)/cost_g, 2) if cost_g > 0 else 0
    imp_dp   = round(100*(cost_g-dp_cost)/cost_g, 2) if dp_cost > 0 and cost_g > 0 else None

    return {
        "n_cities":             n_cities,
        "n_stops":              len(stops),
        "greedy_cost":          cost_g,
        "two_opt_cost":         cost_2,
        "dp_cost":              dp_cost,
        "greedy_ms":            round((t1-t0)*1000, 3),
        "two_opt_ms":           round((t3-t2)*1000, 3),
        "dp_ms":                dp_ms,
        "improvement_2opt_pct": imp_2opt,
        "improvement_dp_pct":   imp_dp,
    }

# ── Member 1: Greedy driver assignment ───────────────────────────────────────

def assign_orders(orders, drivers):
    priority_map = {"URGENT": 2, "NORMAL": 1, "LOW": 0}
    sorted_orders = sorted(orders, key=lambda o: -priority_map.get(o.get("priority","NORMAL"), 1))
    driver_loads = {i: 0 for i in range(len(drivers))}
    assignments = []
    for oid, o in enumerate(sorted_orders):
        w = o.get("weight", 0)
        assigned = False
        for did, d in enumerate(drivers):
            if driver_loads[did] + w <= d["capacity"]:
                driver_loads[did] += w
                assignments.append({
                    "order_id":  oid+1,
                    "driver_id": did+1,
                    "driver":    d["name"],
                    "priority":  o.get("priority","NORMAL"),
                    "weight":    w,
                    "src":       o.get("src", 0),
                    "dst":       o.get("dst", 0),
                })
                assigned = True
                break
        if not assigned:
            assignments.append({
                "order_id":  oid+1,
                "driver_id": -1,
                "driver":    "UNASSIGNED",
                "priority":  o.get("priority","NORMAL"),
                "weight":    w,
                "src":       o.get("src", 0),
                "dst":       o.get("dst", 0),
            })
    driver_summary = [
        {"id": i+1, "name": d["name"], "capacity": d["capacity"], "load": driver_loads[i]}
        for i, d in enumerate(drivers)
    ]
    return {"assignments": assignments, "drivers": driver_summary}

# ── Command dispatcher (mirrors C++ binary interface) ─────────────────────────

def run_command(cmd, inp):
    if cmd == "generate":
        n, seed = inp.get("n", 10), inp.get("seed", 42)
        n = max(2, min(40, n))
        nodes, edges, adj = build_india_graph(n, seed)
        return {"nodes": nodes, "edges": edges, "n": n}

    if cmd == "shortest":
        n, seed = inp.get("n", 10), inp.get("seed", 42)
        src, dst = inp.get("src", 0), inp.get("dst", 1)
        nodes, edges, adj = build_india_graph(n, seed)
        src, dst = max(0, min(n-1, src)), max(0, min(n-1, dst))
        dist, prev = dijkstra(adj, n, src)
        raw_path   = reconstruct_path(prev, dst) if dist[dst] != INF else []
        path_out   = [{"idx": i, "name": nodes[i]["id"], "x": nodes[i]["x"], "y": nodes[i]["y"], "lat": nodes[i]["lat"], "lng": nodes[i]["lng"]} for i in raw_path]
        return {
            "src": src, "dst": dst,
            "src_name": nodes[src]["id"], "dst_name": nodes[dst]["id"],
            "cost": round(dist[dst], 2) if dist[dst] != INF else -1,
            "reachable": dist[dst] != INF,
            "path": path_out,
        }

    if cmd == "tsp":
        n, seed  = inp.get("n", 10), inp.get("seed", 42)
        depot    = inp.get("depot", 0)
        stops    = [s for s in inp.get("stops", []) if 0 <= s < n and s != depot]
        algo     = inp.get("algo", "greedy")
        nodes, edges, adj = build_india_graph(n, seed)
        if algo == "dp" and len(stops) <= 12:
            tour = tsp_dp(adj, n, depot, stops)
        else:
            tour = tsp_nearest_neighbor(adj, n, depot, stops)
            if algo == "2opt":
                tour = two_opt(adj, n, tour)
        cost     = path_cost(adj, n, tour)
        tour_out = [{"idx": i, "name": nodes[i]["id"], "x": nodes[i]["x"], "y": nodes[i]["y"], "lat": nodes[i]["lat"], "lng": nodes[i]["lng"]} for i in tour]
        return {"algo": algo, "cost": cost, "tour": tour_out}

    if cmd == "assign":
        return assign_orders(inp.get("orders", []), inp.get("drivers", []))

    if cmd == "benchmark":
        sizes = inp.get("sizes", [5, 10, 20, 50])
        return [benchmark_single(s, min(s-1, 10)) for s in sizes if s > 1]

    if cmd == "knapsack":
        return knapsack_dp(inp.get("weights", []), inp.get("values", []), inp.get("capacity", 100))

    return {"error": f"unknown command: {cmd}"}
