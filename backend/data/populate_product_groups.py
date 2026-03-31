#!/usr/bin/env python3
"""Populate product_groups field based on platform_id patterns"""

import json
import re
from pathlib import Path

def get_product_group(platform_id):
    """Determine product group from platform_id"""
    if not platform_id:
        return []
    
    platform_id = platform_id.lower()
    
    # iPhone patterns
    if "iphone_17_pro_max" in platform_id:
        return ["iphone_17_pro_max"]
    elif "iphone_17_pro" in platform_id:
        return ["iphone_17_pro"]
    elif "iphone_17" in platform_id:
        return ["iphone_17"]
    
    # Galaxy patterns
    elif "galaxy_s26" in platform_id:
        return ["galaxy_s26"]
    
    return []

def process_catalog_file(filepath):
    """Process a catalog file and populate product_groups"""
    print(f"Processing {filepath}...")
    
    with open(filepath, 'r') as f:
        data = json.load(f)
    
    updated_count = 0
    
    if "resources" in data:
        for resource in data["resources"]:
            if "platform_id" in resource and "product_groups" in resource:
                platform_id = resource["platform_id"]
                product_group = get_product_group(platform_id)
                
                # Only update if product_groups is empty
                if resource["product_groups"] == []:
                    resource["product_groups"] = product_group
                    updated_count += 1
                    print(f"  ✓ {platform_id} → {product_group}")
    
    # Write back
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"  Updated {updated_count} products\n")
    return updated_count

# Process all catalog files
data_dir = Path(__file__).parent
catalog_files = [
    data_dir / "catalog_part2.json",
    data_dir / "catalog_part3.json",
]

total_updated = 0
for catalog_file in catalog_files:
    if catalog_file.exists():
        total_updated += process_catalog_file(catalog_file)
    else:
        print(f"File not found: {catalog_file}\n")

print(f"Total products updated: {total_updated}")
