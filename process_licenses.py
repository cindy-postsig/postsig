import json
import openpyxl

def create_license_excel(json_file_path, excel_file_path, package_json_path="package.json"):
    """
    Reads license data from a JSON file, filters it based on package.json,
    and writes it to an Excel file.

    Args:
        json_file_path (str): Path to the input JSON file (from license-checker).
        excel_file_path (str): Path to the output Excel file.
        package_json_path (str): Path to the package.json file.
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

    try:
        with open(package_json_path, 'r') as f:
            package_data = json.load(f)
        major_dependencies = set()
        if 'dependencies' in package_data and package_data['dependencies']:
            major_dependencies.update(package_data['dependencies'].keys())
        if 'devDependencies' in package_data and package_data['devDependencies']:
            major_dependencies.update(package_data['devDependencies'].keys())
        if not major_dependencies:
            print(f"Warning: No dependencies found in {package_json_path}. The Excel file might be empty or include all licenses if this was unintended.")

    except FileNotFoundError:
        print(f"Error: {package_json_path} file not found. Cannot filter for major libraries.")
        return
    except json.JSONDecodeError:
        print(f"Error: Could not decode JSON from {package_json_path}. Cannot filter for major libraries.")
        return

    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = "Major Licenses"

    # Headers
    headers = ["Package Name", "Version", "License", "Repository"]
    sheet.append(headers)

    # Adjust column widths
    sheet.column_dimensions['A'].width = 40
    sheet.column_dimensions['B'].width = 15
    sheet.column_dimensions['C'].width = 25
    sheet.column_dimensions['D'].width = 50
    # sheet.column_dimensions['E'].width = 30
    # Column F (previously Email) and G (previously Path) could be set if re-added
    # sheet.column_dimensions['F'].width = 30
    # sheet.column_dimensions['G'].width = 60

    # Data
    included_packages_count = 0
    for package_name_version, details in licenses_data.items():
        parts = package_name_version.rsplit('@', 1)
        package_name = parts[0]
        version = parts[1] if len(parts) > 1 else ""

        if package_name in major_dependencies:
            row = [
                package_name,
                version,
                details.get("licenses", ""),
                details.get("repository", "")
                # details.get("publisher", "") # Commented out as per user's last change
            ]
            sheet.append(row)
            included_packages_count += 1
    
    if included_packages_count == 0 and major_dependencies:
        print(f"No major dependencies from {package_json_path} were found in {json_file_path}. The Excel file will be empty or only contain headers.")
    elif not major_dependencies and included_packages_count > 0 :
         print(f"Warning: No dependencies were explicitly read from {package_json_path}, but {included_packages_count} packages were written. This might mean all packages from license-checker were included if filtering failed.")

    try:
        workbook.save(excel_file_path)
        print(f"Successfully created Excel file with {included_packages_count} major libraries: {excel_file_path}")
    except Exception as e:
        print(f"Error saving Excel file: {e}")

if __name__ == "__main__":
    json_input_file = "licenses.json"
    excel_output_file = "major_licenses_report.xlsx"
    create_license_excel(json_input_file, excel_output_file) 