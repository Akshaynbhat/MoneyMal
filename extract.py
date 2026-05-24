import zipfile
import os

zip_path = r"C:\Users\Manas\Downloads\MoneyMal-main (7).zip"
dest_folder = r"C:\Users\Manas\.antigravity\MoneyMal\temp_unzip"

try:
    if os.path.exists(zip_path):
        os.makedirs(dest_folder, exist_ok=True)
        print(f"Extracting {zip_path} into {dest_folder}...")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(dest_folder)
        print("Extraction successful!")
    else:
        print("Error: Zip file not found at that location.")
except Exception as e:
    print(f"Extraction failed: {e}")
