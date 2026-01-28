import os
import glob
import pandas as pd
import sqlite3
import datetime

SOURCE_DIR = r"C:\Users\weslley.bonifacio\OneDrive - BNF BANK PLC\Documents\.HR\TOIL"
DB_PATH = r"C:\Users\weslley.bonifacio\.gemini\antigravity\scratch\LOTS\calendar.db"

def parse_employee_name(filename):
    basename = os.path.basename(filename)
    name_part = basename.replace("TOIL_", "").replace(".xlsx", "")
    return name_part.replace("_", " ").strip()

def ingest_file(filepath, conn):
    employee_name = parse_employee_name(filepath)
    print(f"Processing {employee_name}...")

    tabs = ["OVERTIME", "TOIL", "PAID", "SICK", "MARRIAGE"]

    # Ingest TOIL/Overtime/Sick/Paid
    for tab in tabs:
        try:
            df = pd.read_excel(filepath, sheet_name=tab, header=None)

            if df.shape[0] < 3:
                continue

            data = df.iloc[2:, 1:5].copy()
            data.columns = ["date", "start_time", "finish_time", "duration"]

            cursor = conn.cursor()

            for _, row in data.iterrows():
                if pd.isna(row["date"]):
                    break

                # ----- Date formatting -----
                date_val = row["date"]
                if isinstance(date_val, datetime.datetime):
                    date_str = date_val.strftime("%Y-%m-%d")
                else:
                    d = str(date_val).strip()
                    if "/" in d:
                        day, month, year = d.split("/")
                        date_str = f"{year}-{month}-{day}"
                    else:
                        date_str = d

                duration = round(row["duration"], 2) if not pd.isna(row["duration"]) else 0.0

                cursor.execute("""
                    INSERT INTO toil_entries
                    (employee_name, type, date, start_time, finish_time, duration)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    employee_name,
                    tab,
                    date_str,
                    str(row["start_time"]) if not pd.isna(row["start_time"]) else "",
                    str(row["finish_time"]) if not pd.isna(row["finish_time"]) else "",
                    duration
                ))

        except Exception as e:
            # print(f"Error processing {tab} for {employee_name}: {e}")
            pass

    # Ingest DATA tab (Leave Data)
    try:
        # DATA tab: Year, Type, Value (starts row 3)
        df_data = pd.read_excel(filepath, sheet_name="DATA", header=None)
        if df_data.shape[0] >= 3:
             # Slice from row 3 (index 2), first 3 columns
            data_rows = df_data.iloc[2:, :3].copy()
            data_rows.columns = ["year", "type", "value"]
            
            cursor = conn.cursor()
            for _, row in data_rows.iterrows():
                if pd.isna(row["year"]):
                    break
                
                # Robust year handling: 2025.0 -> "2025", 2025 -> "2025", "2025" -> "2025"
                raw_year = row["year"]
                if isinstance(raw_year, float):
                     year_val = str(int(raw_year)).strip()
                else:
                     year_val = str(raw_year).strip()

                type_val = str(row["type"]).strip()
                val = row["value"]
                
                if pd.isna(val):
                    val = 0.0
                else:
                    val = round(val, 2)
                
                cursor.execute("""
                    INSERT INTO leave_data (employee_name, year, type, value)
                    VALUES (?, ?, ?, ?)
                """, (employee_name, year_val, type_val, val))
                
            # log(f"Ingested leave data for {employee_name}")
            
    except Exception as e:
        log(f"Error processing DATA tab for {employee_name}: {e}")


def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Drop tables
    cursor.execute("DROP TABLE IF EXISTS toil_entries")
    cursor.execute("DROP TABLE IF EXISTS leave_data") # Recreate leave_data

    # Create toil_entries
    cursor.execute("""
        CREATE TABLE toil_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_name TEXT NOT NULL,
            type TEXT NOT NULL,
            date TEXT NOT NULL,
            start_time TEXT,
            finish_time TEXT,
            duration REAL NOT NULL
        )
    """)
    
    # Create leave_data
    cursor.execute("""
        CREATE TABLE leave_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_name TEXT NOT NULL,
            year TEXT NOT NULL,
            type TEXT NOT NULL,
            value REAL NOT NULL
        )
    """)

    files = glob.glob(os.path.join(SOURCE_DIR, "TOIL_*.xlsx"))
    print(f"Found {len(files)} files.")

    for f in files:
        ingest_file(f, conn)

    ingest_holidays(conn) 

    conn.commit()
    conn.close()
    print("Ingestion complete.")

def log(msg):
    with open("ingest_log.txt", "a") as f:
        f.write(msg + "\n")
    print(msg)

def ingest_holidays(conn):
    HOLIDAYS_FILE = os.path.join(SOURCE_DIR, "HOLIDAYS.xlsx")
    log(f"Processing Holidays from {HOLIDAYS_FILE}...")
    
    if not os.path.exists(HOLIDAYS_FILE):
        log(f"WARNING: Holidays file not found at {HOLIDAYS_FILE}")
        return

    try:
        log("Reading Excel file (header=None)...")
        df = pd.read_excel(HOLIDAYS_FILE, header=None)
        
        # Take first 3 columns
        df = df.iloc[:, :3]
        df.columns = ["Date", "Description", "Type"]
        
        # Assuming row 3 (index 2) is start of data:
        df = df.iloc[2:].copy() 
        
        cursor = conn.cursor()
        
        # Drop and recreate table
        cursor.execute("DROP TABLE IF EXISTS holidays")
        cursor.execute("""
            CREATE TABLE holidays (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                description TEXT,
                type TEXT
            )
        """)
        
        count = 0
        for _, row in df.iterrows():
            if pd.isna(row["Date"]):
                continue
                
            date_val = row["Date"]
            if isinstance(date_val, datetime.datetime):
                date_str = date_val.strftime("%Y-%m-%d")
            else:
                d = str(date_val).strip()
                try:
                    if "/" in d:
                        day, month, year = d.split("/")
                        date_str = f"{year}-{month}-{day}"
                    else:
                        date_str = d 
                except:
                    date_str = d
            
            description = row["Description"]
            type_val = row["Type"]
            
            cursor.execute("""
                INSERT INTO holidays (date, description, type)
                VALUES (?, ?, ?)
            """, (date_str, description, type_val))
            count += 1
            
        log(f"Ingested {count} holidays.")

    except Exception as e:
        log(f"Error processing holidays: {e}")
        import traceback
        log(traceback.format_exc())

if __name__ == "__main__":
    main()

