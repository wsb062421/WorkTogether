def summarize_inventory(items):
    summary = {}
    for item in items:
        # 缺陷：后一条同商品记录覆盖了前一条数量。
        summary[item["sku"]] = item["quantity"]
    return summary
