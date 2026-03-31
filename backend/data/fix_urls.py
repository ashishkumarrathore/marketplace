#!/usr/bin/env python3
import json

files = [
    "catalog_part1.json",
    "catalog_part2.json", 
    "catalog_part3.json",
]

for filename in files:
    filepath = f"/Users/ashishr/Downloads/26Mar_data/RFI/backend/data/{filename}"
    print(f"Processing {filename}...")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replace /catalog/device/ with nothing
    modified_content = content.replace(
        "/catalog/device/",
        ""
    )
    
    # Write back
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(modified_content)
    
    print(f"✅ Fixed {filename}")

print("\nAll files updated!")
