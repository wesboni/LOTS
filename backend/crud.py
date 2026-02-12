from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any
import json
from datetime import datetime, timedelta, date
import calendar

def create_recurrence(db: Session, data: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    # 1. Parse Data
    rec_id = data.get('id') # If editing
    emp_id = data.get('employee_id')
    rtype = data.get('type')
    start_date_str = data.get('start_date')
    end_date_str = data.get('end_date')
    start_time = data.get('start_time')
    finish_time = data.get('finish_time')
    days_str = data.get('days_of_week') 
    
    if not (emp_id and rtype and start_date_str and end_date_str and days_str):
        raise ValueError("Missing required fields")

    s_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
    e_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
    
    # Cap End Date to End of Start Month
    last_day_month = calendar.monthrange(s_date.year, s_date.month)[1]
    max_date = date(s_date.year, s_date.month, last_day_month)
    if e_date > max_date: e_date = max_date
        
    # 2. Create or Update Recurrence Record
    if rec_id:
         # Update
         sql_upd = """
            UPDATE recurrences 
            SET type=:type, start_date=:sdate, end_date=:edate, start_time=:stime, finish_time=:ftime, days_of_week=:days
            WHERE id=:id
         """
         db.execute(text(sql_upd), {
             "type": rtype, "sdate": s_date, "edate": e_date, 
             "stime": start_time, "ftime": finish_time, "days": days_str, "id": rec_id
         })
    else:
        # Insert
        sql_rec = """
            INSERT INTO recurrences (employee_id, type, start_date, end_date, start_time, finish_time, days_of_week)
            VALUES (:eid, :type, :sdate, :edate, :stime, :ftime, :days)
            RETURNING id
        """
        res = db.execute(text(sql_rec), {
            "eid": emp_id, "type": rtype, "sdate": s_date, "edate": e_date, 
            "stime": start_time, "ftime": finish_time, "days": days_str
        })
        rec_id = res.fetchone()[0]
    
    # 3. Generate Target Dates
    target_days = set(map(int, days_str.split(',')))
    target_dates = []
    
    curr = s_date
    while curr <= e_date:
        day_idx = curr.isoweekday() % 7 
        if day_idx in target_days:
            target_dates.append(curr)
        curr += timedelta(days=1)
        
    # 4. Fetch Existing Events for this Series
    existing_map = {}
    if rec_id:
        # Fetch only within the NEW date range? 
        # Or all? If we shortened the range, we should probably delete outliers?
        # User said "recurrency applied just for current month".
        # Let's fetch all events linked to this recurrence_id in the *new* valid window + outliers?
        # Simplest: Fetch ALL for this RecurrenceID.
        rows = db.execute(text("SELECT * FROM events WHERE recurrence_id = :rid"), {"rid": rec_id}).mappings().fetchall()
        for r in rows:
            # Key by Date
            # Assume one event per date per recurrence
            d_str = r['date'] # might be date obj
            if hasattr(d_str, 'isoformat'): d_str = d_str.isoformat()
            else: d_str = str(d_str)
            existing_map[d_str] = dict(r)

    # Calc Duration
    fmt = "%H:%M:%S"
    if len(start_time) == 5: start_time += ":00"
    if len(finish_time) == 5: finish_time += ":00"
    t1 = datetime.strptime(start_time, fmt)
    t2 = datetime.strptime(finish_time, fmt)
    duration_hours = (t2 - t1).total_seconds() / 3600
    if duration_hours < 0: duration_hours += 24
    
    today = date.today()
    generated_count = 0
    
    # 5. Sync Logic
    
    # A. Process Target Dates (Update or Insert)
    for d in target_dates:
        d_str = d.isoformat()
        
        # Derive Status
        status = 'Planned'
        if d < today:
            status = 'Taken'
            if rtype == 'OVERTIME': status = 'Earned'
            if rtype == 'ONCALL': status = 'Done'
        # ... logic for Sick/Bereavement ...
        if rtype in ['SICK', 'BEREAVEMENT', 'SICK CERTIFIED']: status = 'Taken'

        if d_str in existing_map:
            # UPDATE
            evt = existing_map[d_str]
            
            # Smart Update Logic: Check if anything ACTUALLY changed
            # Normalize times for comparison
            # DB times might be time objects or strings.
            # Convert to strings HH:MM:SS for comparison
            
            def norm_t(t):
                if hasattr(t, 'strftime'): return t.strftime("%H:%M:%S")
                return str(t)
            
            curr_type = evt['type']
            curr_s = norm_t(evt['start_time'])
            curr_f = norm_t(evt['finish_time'])
            curr_stat = evt['status']
            
            # New values
            new_s = start_time
            new_f = finish_time
            # start_time/finish_time in `data` are strings HH:MM(:SS)
            if len(new_s) == 5: new_s += ":00"
            if len(new_f) == 5: new_f += ":00"
            
            # Check equality (Including Status! If status changed manually, we don't want to revert it unless input changed)
            # Actually, calculate status anew. If calc status != DB status, that is a change.
            # BUT: if DB status is 'Taken' (e.g. manually set or Bereavement default) and calc is 'Taken', it matches.
            # If DB is 'Earned' and calc 'Earned', match.
            
            is_changed = (
                curr_type != rtype or
                curr_s != new_s or
                curr_f != new_f or
                curr_stat != status
            )
            
            orig_str = evt.get('original_data')
            situation = evt.get('situation')
            
            new_sit = situation
            new_orig = orig_str
            
            if is_changed:
                if situation == 'Approved':
                    snap = dict(evt)
                    for k, v in snap.items():
                        if hasattr(v, 'isoformat'): snap[k] = v.isoformat()
                        if hasattr(v, '__str__'): snap[k] = str(v)
                    new_orig = json.dumps(snap)
                    new_sit = 'Updated'
                elif situation == 'Added':
                    new_sit = 'Added' 
                elif situation == 'Updated':
                    new_sit = 'Updated'
            else:
                 # No change in critical fields. Keep existing situation and original data.
                 # Ensure we don't accidentally overwrite 'Approved' with 'Added' or anything.
                 new_sit = situation
                 new_orig = orig_str

            # Execute Update
            # Even if not changed, we execute update to ensure all fields match (idempotent)
            # Or skip? Faster to skip, but Update ensures consistency.
            # Let's Update with the (potentially old) values.
            
            sql_up = """
                UPDATE events SET 
                    type=:type, start_time=:stime, finish_time=:ftime, duration_hour=:dur, 
                    status=:stat, situation=:sit, original_data=:orig
                WHERE id=:id
            """
            db.execute(text(sql_up), {
                "type": rtype, "stime": start_time, "ftime": finish_time, "dur": duration_hours,
                "stat": status, "sit": new_sit, "orig": new_orig, "id": evt['id']
            })
            # Remove from map to track processed
            del existing_map[d_str]
            generated_count += 1
            
        else:
            # INSERT
            sql_ins = """
                INSERT INTO events (employee_id, type, date, start_time, finish_time, duration_hour, status, situation, recurrence_id)
                VALUES (:eid, :type, :date, :stime, :ftime, :dur, :stat, 'Added', :rid)
            """
            db.execute(text(sql_ins), {
                "eid": emp_id, "type": rtype, "date": d, "stime": start_time, "ftime": finish_time, 
                "dur": duration_hours, "stat": status, "rid": rec_id
            })
            generated_count += 1
            
    # B. Cleanup Outliers (Events in existing_map that were NOT in target_dates)
    # i.e., User removed a day from the series, or shortened the range.
    for d_str, evt in existing_map.items():
        # Soft Delete? Or Hard Delete if it was 'Added'?
        # If 'Approved', mark 'Deleted'. 
        # If 'Added', Hard Delete.
        
        sit = evt.get('situation')
        eid = evt['id']
        
        if sit == 'Added':
            db.execute(text("DELETE FROM events WHERE id=:id"), {"id": eid})
        else:
            db.execute(text("UPDATE events SET situation='Deleted' WHERE id=:id"), {"id": eid})

    db.commit()
    return {"id": rec_id, "count": generated_count}

def save_events_logic(db: Session, events: List[Dict[str, Any]]):
    try:
        # 1. Identify IDs to update/fetch for original_data logic
        update_ids = [e['id'] for e in events if e.get('id') and e.get('situation') not in ['Added', 'HardDelete']]
        
        current_map = {}
        if update_ids:
            # Fetch existing rows
            # We need to fetch RAW rows to get original_data text
            result = db.execute(text(f"SELECT * FROM events WHERE id IN ({','.join(map(str, update_ids))})"))
            for row in result:
                current_map[row.id] = row._mapping

        # Transaction handled by caller or implicit in session commit? 
        # Better to manage explicit transaction here.
        
        for ev in events:
            ev_id = ev.get('id')
            situation = ev.get('situation')
            
            # -- MAP FIELDS TO DB SCHMA -- 
            # Frontend sends: employee_name. DB needs: employee_id.
            # We need to resolve employee_name -> employee_id
            emp_id = None
            if ev.get('employee_name'):
                # Cache this lookup ideally, but for now simple query
                res = db.execute(text("SELECT id FROM employees WHERE name = :name"), {"name": ev['employee_name']}).fetchone()
                if res:
                    emp_id = res[0]
            
            # Defaults
            val_date = ev.get('date')
            val_start = ev.get('start_time')
            val_finish = ev.get('finish_time')
            # normalize 00:00:00 -> 23:59:59 (although refined DB has it, new input might not)
            if val_finish == '00:00:00' or val_finish == '23:59:00':
                val_finish = '23:59:59'
                
            val_comment = ev.get('comment', '')
            val_status = ev.get('status')
            val_type = ev.get('type')
            val_duration_time = ev.get('duration_time') # specific logic needed?
            val_duration_hour = ev.get('duration_hour')
            
            # Enforce Status Rules (Backend Safety)
            if val_type in ['BEREAVEMENT', 'SICK', 'SICK CERTIFIED']:
                val_status = 'Taken'
            if val_type == 'ONCALL' and val_date:
                 today_str = date.today().isoformat()
                 if val_date < today_str: val_status = 'Done'
                 # Future OnCall -> Planned (or keep as is)
            
            if situation == 'Deleted' and ev_id:
                db.execute(text("UPDATE events SET situation = 'Deleted' WHERE id = :id"), {"id": ev_id})
                
            elif situation == 'HardDelete' and ev_id:
                db.execute(text("DELETE FROM events WHERE id = :id"), {"id": ev_id})
                
            elif ev_id:
                # UPDATE
                current = current_map.get(ev_id)
                original_data_str = None
                
                if current:
                    if current['situation'] == 'Approved':
                        # Snapshot current state as original_data (must serialize dict)
                        # We need to reconstruct the dict to match Node's JSON structure for restore
                        # Node stored: {id, employee_name, type...}
                        # We should store similar JSON
                        snap = dict(current)
                        # We might need to fetch employee_name for consistency if we store it
                        # For now, just store what we have.
                        # Datetime objects need stringify
                        for k, v in snap.items():
                            if hasattr(v, 'isoformat'): snap[k] = v.isoformat()
                            if hasattr(v, '__str__'): snap[k] = str(v)
                            
                        original_data_str = json.dumps(snap)
                    elif current['situation'] == 'Updated' and current.get('original_data'):
                        original_data_str = current['original_data']
                    elif current.get('original_data'):
                         original_data_str = current['original_data']

                # Update Query
                sql = """
                    UPDATE events 
                    SET employee_id=:eid, type=:type, date=:date, start_time=:start, finish_time=:finish, 
                        duration_time=:dtime, duration_hour=:dhour, comment=:comment, situation=:sit, status=:stat, original_data=:org
                    WHERE id=:id
                """
                db.execute(text(sql), {
                    "eid": emp_id, "type": val_type, "date": val_date, "start": val_start, "finish": val_finish,
                    "dtime": val_duration_time, "dhour": val_duration_hour, "comment": val_comment, 
                    "sit": situation, "stat": val_status, "org": original_data_str, "id": ev_id
                })
                
            else:
                # INSERT
                # ID generated by DB Sequence (SERIAL behavior)
                
                sql = """
                    INSERT INTO events (employee_id, type, date, start_time, finish_time, duration_time, duration_hour, comment, situation, status)
                    VALUES (:eid, :type, :date, :start, :finish, :dtime, :dhour, :comment, :sit, :stat)
                """
                db.execute(text(sql), {
                    "eid": emp_id, "type": val_type, "date": val_date, "start": val_start, "finish": val_finish,
                    "dtime": val_duration_time, "dhour": val_duration_hour, "comment": val_comment, 
                    "sit": situation, "stat": val_status
                })
        
        db.commit()
        return True
        
    except Exception as e:
        db.rollback()
        raise e

def approve_events_logic(db: Session, ids: List[int]):
    try:
        # Convert list of ints to string for SQL IN
        if not ids: return
        
        # 1. Fetch to check deleted (Logic from Node)
        # We can implement simpler: 
        # DELETE WHERE id IN ids AND situation = 'Deleted'
        # UPDATE WHERE id IN ids AND situation != 'Deleted' SET situation='Approved', original_data=NULL
        
        str_ids = ",".join(map(str, ids))
        
        # Delete marked
        db.execute(text(f"DELETE FROM events WHERE id IN ({str_ids}) AND situation = 'Deleted'"))
        
        # Approve others
        db.execute(text(f"UPDATE events SET situation = 'Approved', original_data = NULL WHERE id IN ({str_ids}) AND situation != 'Deleted'"))
        
        db.commit()
    except Exception as e:
        db.rollback()
        raise e

def reject_events_logic(db: Session, ids: List[int]):
    # Logic: 
    # Added -> Delete
    # Deleted -> Restore (situation='Approved')
    # Updated -> Restore from original_data
    try:
        if not ids: return
        str_ids = ",".join(map(str, ids))
        
        rows = db.execute(text(f"SELECT * FROM events WHERE id IN ({str_ids})")).fetchall()
        
        for row in rows:
            r = row._mapping
            if r['situation'] == 'Added':
                db.execute(text("DELETE FROM events WHERE id = :id"), {"id": r['id']})
            elif r['situation'] == 'Deleted':
                db.execute(text("UPDATE events SET situation = 'Approved' WHERE id = :id"), {"id": r['id']})
            elif r['situation'] == 'Updated':
                # Revert
                if r.get('original_data'):
                    try:
                        orig = json.loads(r['original_data'])
                        # We need to map orig fields back to cols
                        # orig might have 'employee_name' -> need 'employee_id'?
                        # Or orig is from this DB so it has 'employee_id'?
                        # If data verified step 2 had original_data populated from SQLite, it has SQLite structure (employee_name).
                        # If created via new Python, it has new structure.
                        # MIGRATION RISK: Old original_data has 'employee_name'. New DB needs 'employee_id'.
                        # FIX: If orig has employee_name, lookup ID.
                        
                        emp_id = orig.get('employee_id')
                        if not emp_id and orig.get('employee_name'):
                             res = db.execute(text("SELECT id FROM employees WHERE name = :name"), {"name": orig['employee_name']}).fetchone()
                             if res: emp_id = res[0]
                        
                        sql = """
                            UPDATE events
                            SET employee_id=:eid, type=:type, date=:date, start_time=:start, finish_time=:finish,
                                duration_time=:dtime, duration_hour=:dhour, comment=:comment, situation='Approved', status=:stat, original_data=NULL
                            WHERE id=:id
                        """
                        # Safe get for all fields
                        db.execute(text(sql), {
                            "eid": emp_id,
                            "type": orig.get('type'),
                            "date": orig.get('date'),
                            "start": orig.get('start_time'),
                            "finish": orig.get('finish_time'),
                            "dtime": orig.get('duration_time'),
                            "dhour": orig.get('duration_hour'),
                            "comment": orig.get('comment'),
                            "stat": orig.get('status'),
                            "id": r['id']
                        })
                    except Exception as parse_err:
                        print(f"Error parsing original_data: {parse_err}")
                        # Fallback
                        db.execute(text("UPDATE events SET situation = 'Approved' WHERE id = :id"), {"id": r['id']})
                else:
                    db.execute(text("UPDATE events SET situation = 'Approved' WHERE id = :id"), {"id": r['id']})
                    
        db.commit()

    except Exception as e:
        db.rollback()
        raise e
