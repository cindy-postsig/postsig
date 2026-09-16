import json
import openpyxl

def create_license_excel(json_file_path, excel_file_path):
    """
    Reads license data from a JSON file and writes it to an Excel file.

    Args:
        json_file_path (str): Path to the input JSON file (from license-checker).
        excel_file_path (str): Path to the output Excel file.
    """
    try:
        with open(json_file_path, 'r') as f:
            licenses_data = json.load(f)
    except FileNotFoundError:
        print(f"Error: JSON file not found at {json_file_path}")
        return
    except json.JSONDecodeError:
        print(f"Error: Could not decode JSON from {json_file_path}")
        return

    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = "Licenses"

    # Headers
    headers = ["Package Name", "Version", "License", "Repository"]
    sheet.append(headers)

    # Adjust column widths
    # Column A: Package Name
    sheet.column_dimensions['A'].width = 40
    # Column B: Version
    sheet.column_dimensions['B'].width = 15
    # Column C: License
    sheet.column_dimensions['C'].width = 25
    # Column D: Repository
    sheet.column_dimensions['D'].width = 50
    # Column E: Publisher
    # sheet.column_dimensions['E'].width = 30
    # Column F (previously Email) and G (previously Path) could be set if re-added
    # sheet.column_dimensions['F'].width = 30
    # sheet.column_dimensions['G'].width = 60

    # Data
    for package_name_version, details in licenses_data.items():
        # package_name_version is usually in the format "name@version"
        parts = package_name_version.rsplit('@', 1)
        package_name = parts[0]
        version = parts[1] if len(parts) > 1 else "" # Handle cases where version might be missing

        row = [
            package_name,
            version,
            details.get("licenses", ""),
            details.get("repository", "")
        ]
        sheet.append(row)

    try:
        workbook.save(excel_file_path)
        print(f"Successfully created Excel file: {excel_file_path}")
    except Exception as e:
        print(f"Error saving Excel file: {e}")

if __name__ == "__in__":
    json_input_file = "licenses.json"
    excel_output_file = "licenses_report.xlsx"
    create_license_excel(json_input_file, excel_output_file) 