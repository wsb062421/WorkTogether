def payable_amount(items, discount_threshold=100, discount_rate=0.1):
    # 缺陷：尚未应用满额折扣。
    return round(sum(item["price"] * item["quantity"] for item in items), 2)
