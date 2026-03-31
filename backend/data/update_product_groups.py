#!/usr/bin/env python3
"""
Update product_groups in catalog JSON files to organize by device type
- iphone_17_pro: all iPhone 17 Pro variants
- iphone_17: all iPhone 17 variants
- iphone_17_pro_max: all iPhone 17 Pro Max variants
"""

import json

def update_product_groups(filepath):
    """Update product_groups for all products"""
    print(f"Processing {filepath}...")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    updated = 0
    
    for resource in data.get('resources', []):
        platform_id = resource.get('platform_id', '').lower()
        
        # Determine product group based on platform_id
        if 'iphone_17_pro_max' in platform_id:
            resource['product_groups'] = ['iphone_17_pro_max']
            updated += 1
        elif 'iphone_17_pro' in platform_id:
            resource['product_groups'] = ['iphone_17_pro']
            updated += 1
        elif 'iphone_17' in platform_id:
            resource['product_groups'] = ['iphone_17']
            updated += 1
    
    # Write back
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
    
    print(f"✅ Updated {updated} products with product_groups")
    return updated

if __name__ == "__main__":
    base = "/Users/ashishr/Downloads/26Mar_data/RFI/backend/data"
    
    total = 0
    for part in [1, 2, 3]:
        fp = f"{base}/catalog_part{part}.json"
        total += update_product_groups(fp)
    
    print(f"\n✅ Total products updated: {total}")
