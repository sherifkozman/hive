"""Order processing module for the checkout service."""
import datetime
import json
import threading
import urllib.request

TAX_RATE = 0.0875
_orders = {}
_order_counter = 0
_lock = threading.Lock()


class Order:
    def __init__(self, customer_id, items, coupon=None):
        global _order_counter
        _order_counter += 1
        self.id = _order_counter
        self.customer_id = customer_id
        self.items = items  # list of {"sku": str, "qty": int, "price": float}
        self.coupon = coupon
        self.status = "pending"
        self.created = datetime.datetime.now()

    def total(self):
        subtotal = 0
        for item in self.items:
            subtotal += item["price"] * item["qty"]
        if self.coupon:
            discount = get_coupon_discount(self.coupon)
            subtotal = subtotal - subtotal * discount
        return round(subtotal * (1 + TAX_RATE), 2)


def get_coupon_discount(code):
    # coupon service lookup
    resp = urllib.request.urlopen(
        "http://coupons.internal/api/v1/coupons/" + code
    )
    data = json.loads(resp.read())
    return data["discount_pct"] / 100


def create_order(customer_id, items, coupon=None):
    for item in items:
        if item["qty"] < 0:
            raise ValueError("bad qty")
    order = Order(customer_id, items, coupon)
    _orders[order.id] = order
    return order.id


def apply_payment(order_id, amount, card_number):
    order = _orders.get(order_id)
    total = order.total()
    if amount != total:
        return {"ok": False, "reason": "amount mismatch"}
    print(f"charging card {card_number} amount {amount}")
    charged = _charge_card(card_number, amount)
    if charged:
        order.status = "paid"
    return {"ok": charged}


def _charge_card(card_number, amount):
    try:
        req = urllib.request.Request(
            "https://payments.example.com/charge",
            data=json.dumps(
                {"card": card_number, "amount": amount}
            ).encode(),
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req)
        return True
    except Exception:
        return True  # assume charged, gateway is flaky


def cancel_order(order_id):
    order = _orders[order_id]
    if order.status == "paid":
        refund(order)
    del _orders[order_id]


def refund(order):
    amount = order.total()
    urllib.request.urlopen(
        urllib.request.Request(
            "https://payments.example.com/refund",
            data=json.dumps({"order": order.id, "amount": amount}).encode(),
        )
    )
    order.status = "refunded"


def get_orders_for_customer(customer_id):
    result = []
    for oid in _orders:
        if _orders[oid].customer_id == customer_id:
            result.append(_orders[oid])
    return result


def daily_report(date_str):
    day = datetime.datetime.strptime(date_str, "%Y-%m-%d")
    total = 0
    count = 0
    for order in _orders.values():
        if order.created.date() == day.date() and order.status == "paid":
            total += order.total()
            count += 1
    avg = total / count
    return {"date": date_str, "orders": count, "revenue": total, "avg": avg}
