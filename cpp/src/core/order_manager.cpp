#include "../../include/order.h"
#include "../../include/driver.h"
#include "../../include/graph.h"
#include <vector>
#include <queue>
#include <algorithm>
#include <iostream>
#include <sstream>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

// ── Priority Queue for orders ──────────────────────────────────────────────
struct OrderCmp {
    bool operator()(const Order* a, const Order* b) const {
        // Higher priority first, then lower id
        if (a->priority != b->priority)
            return (int)a->priority < (int)b->priority;
        return a->id > b->id;
    }
};

class OrderManager {
public:
    std::vector<Order> orders;
    std::vector<Driver> drivers;
    int next_order_id = 1;

    // ── Add order ──────────────────────────────────────────────────────────
    Order& addOrder(int src, int dst, int weight, Priority p) {
        orders.push_back({next_order_id++, src, dst, weight, p, Status::PENDING, -1, 0.0});
        return orders.back();
    }

    // ── Greedy driver assignment via priority queue ────────────────────────
    // Returns JSON of assignments
    json assignOrders() {
        // Build max-priority queue of pending orders
        std::priority_queue<Order*, std::vector<Order*>, OrderCmp> pq;
        for (auto& o : orders)
            if (o.status == Status::PENDING)
                pq.push(&o);

        json result = json::array();
        while (!pq.empty()) {
            Order* o = pq.top(); pq.pop();
            // Greedy: pick first available driver that can handle the weight
            bool assigned = false;
            for (auto& d : drivers) {
                if (d.canTake(o->weight)) {
                    o->driver_id = d.id;
                    o->status = Status::ASSIGNED;
                    d.current_load += o->weight;
                    d.assigned_orders.push_back(o->id);
                    result.push_back({
                        {"order_id",   o->id},
                        {"driver_id",  d.id},
                        {"driver",     d.name},
                        {"priority",   o->priorityStr()},
                        {"weight",     o->weight}
                    });
                    assigned = true;
                    break;
                }
            }
            if (!assigned) {
                result.push_back({
                    {"order_id",  o->id},
                    {"driver_id", -1},
                    {"driver",    "UNASSIGNED"},
                    {"priority",  o->priorityStr()},
                    {"weight",    o->weight}
                });
            }
        }
        return result;
    }

    // ── Sort orders by priority + status for display ───────────────────────
    json listOrders() const {
        std::vector<const Order*> sorted;
        for (auto& o : orders) sorted.push_back(&o);
        std::sort(sorted.begin(), sorted.end(), [](const Order* a, const Order* b){
            if (a->priority != b->priority)
                return (int)a->priority > (int)b->priority;
            return a->id < b->id;
        });
        json arr = json::array();
        for (auto* o : sorted) {
            arr.push_back({
                {"id",        o->id},
                {"src",       o->src},
                {"dst",       o->dst},
                {"weight",    o->weight},
                {"priority",  o->priorityStr()},
                {"status",    o->statusStr()},
                {"driver_id", o->driver_id},
                {"distance",  o->distance}
            });
        }
        return arr;
    }

    json listDrivers() const {
        json arr = json::array();
        for (auto& d : drivers) {
            arr.push_back({
                {"id",            d.id},
                {"name",          d.name},
                {"capacity",      d.capacity},
                {"current_load",  d.current_load},
                {"available",     d.available},
                {"orders",        d.assigned_orders}
            });
        }
        return arr;
    }
};
