import pytest

from app.orders import StockError, create_order


def test_stock_is_enough():
    order = create_order("A-1", 2, 5)
    assert order["status"] == "pending_delivery"


def test_insufficient_stock_is_rejected():
    with pytest.raises(StockError):
        create_order("A-1", 6, 5)
