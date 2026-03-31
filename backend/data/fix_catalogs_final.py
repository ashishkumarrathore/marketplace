#!/usr/bin/env python3
import json

base = "/Users/ashishr/Downloads/26Mar_data/RFI/backend/data"

for part in [1, 2, 3]:
    filepath = f"{base}/catalog_part{part}.json"
    print(f"Processing {filepath}...")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    count = 0
    
    # Fix all pictures in resources
    for resource in data.get('resources', []):
        # Fix product pictures (top-level)
        for pics_list in resource.get('pictures', {}).get('en_US', []):
            if isinstance(pics_list, dict) and 'url' in pics_list and '/catalog/device/' in pics_list['url']:
                pics_list['url'] = pics_list['url'].replace('/catalog/device/', '')
                count += 1
        
        # Fix offer pictures
        for offer in resource.get('offers', []):
            for pics_list in offer.get('pictures', {}).get('en_US', []):
                if isinstance(pics_list, dict) and 'url' in pics_list and '/catalog/device/' in pics_list['url']:
                    pics_list['url'] = pics_list['url'].replace('/catalog/device/', '')
                    count += 1
    
    # Write back
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
    
    print(f"✅ Fixed {count} URLs")

print("\nDone!")

