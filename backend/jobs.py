import asyncio
import datetime
from sqlalchemy.orm import Session
from sqlalchemy import text
from .database import SessionLocal

def derive_status(type_str: str, date_str: str, finish_time_str: str) -> str:
    if not type_str or not date_str:
        return ""
    
    today = datetime.date.today()
    if isinstance(date_str, str):
        d_obj = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
    # Check if it's already a date object
    elif hasattr(date_str, 'strftime'):
        d_obj = date_str
    else:
        return "" # Unknown format

    is_past = d_obj < today
    
    # Check Same Day Time
    if d_obj == today and finish_time_str:
         try:
            # finish_time_str is hopefully HH:MM or HH:MM:SS
            now = datetime.datetime.now()
            ft_parts = finish_time_str.split(':')
            f_h = int(ft_parts[0])
            f_m = int(ft_parts[1])
            
            # Create a datetime for the event finish today
            finish_dt = now.replace(hour=f_h, minute=f_m, second=0, microsecond=0)
            is_past = finish_dt <= now
         except Exception:
            pass # Default to False (Planned) if parse fails
    
    # 3. Sick / Bereavement
    if type_str in ['SICK', 'SICK CERTIFIED', 'BEREAVEMENT']:
        return 'Taken'
    
    # 4. Oncall
    if type_str == 'ONCALL':
        return 'Done' if is_past else 'Planned'
    
    # 1. Overtime
    if type_str == 'OVERTIME':
        return 'Earned' if is_past else 'Planned'
    
    # 2. Leaves
    if type_str in ['TOIL', 'PAID', 'MARRIAGE']:
        return 'Taken' if is_past else 'Planned'
    
    return 'Planned'

def refresh_all_event_statuses():
    print(f"[{datetime.datetime.now()}] STATUS REFRESH JOB STARTED")
    db = SessionLocal()
    try:
        # Fetch all events that might need update
        # We could filter, but checking all is safer to ensure consistency
        result = db.execute(text("SELECT id, type, date, finish_time, status FROM events"))
        rows = result.fetchall()
        
        updates = 0
        for r in rows:
            # r is (id, type, date, finish_time, status)
            eid = r[0]
            etype = r[1]
            edate = r[2]
            efinish = r[3]
            current_status = r[4]
            
            new_status = derive_status(etype, edate, efinish)
            
            if new_status and new_status != current_status:
                # Update DB
                # Do NOT set situation='Updated' for automatic status changes.
                # Use current situation (implied by not setting it).
                db.execute(text("UPDATE events SET status = :s WHERE id = :id"), {"s": new_status, "id": eid})
                updates += 1
        
        db.commit()
        print(f"[{datetime.datetime.now()}] STATUS REFRESH JOB COMPLETED. Updated {updates} events.")
    except Exception as e:
        print(f"ERROR IN STATUS JOB: {e}")
        db.rollback()
    finally:
        db.close()

async def start_daily_scheduler():
    while True:
        # Run immediately on start (or wait? User said "Add a daily job", usually implies running consistently)
        # Let's run it once on startup, then every 24h
        # Or better, calculate time to next 01:00 AM?
        # For simplicity/robustness: Run once after a short delay, then sleep 24h.
        
        await asyncio.sleep(10) # Wait 10s for server to settle
        to_thread = asyncio.to_thread(refresh_all_event_statuses)
        await to_thread
        
        # Calculate seconds until next execution (e.g. next midnight)
        # Or simply sleep 24h
        await asyncio.sleep(86400) 
