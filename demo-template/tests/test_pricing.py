from app.pricing import payable_amount


def test_order_at_threshold_gets_discount():
    items = [{"price": 50, "quantity": 2}]
    assert payable_amount(items) == 90


def test_order_below_threshold_keeps_original_price():
    items = [{"price": 99, "quantity": 1}]
    assert payable_amount(items) == 99
