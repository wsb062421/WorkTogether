class StockError(ValueError):
    pass


def create_order(sku, quantity, available):
    # 缺陷：没有检查请求数量与可用库存。
    return {
        "sku": sku,
        "quantity": quantity,
        "status": "pending_delivery",
    }
