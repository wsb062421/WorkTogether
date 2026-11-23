from app.inventory import summarize_inventory


def test_duplicate_sku_quantities_are_summed():
    items = [
        {"sku": "A-1", "quantity": 2},
        {"sku": "A-1", "quantity": 3},
        {"sku": "B-2", "quantity": 4},
    ]

    assert summarize_inventory(items) == {"A-1": 5, "B-2": 4}
