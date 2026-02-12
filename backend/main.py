from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any
from .database import get_db
from .models import EventResponse, EmployeeResponse, HolidayResponse, LeaveDataResponse

from starlette.middleware.sessions import SessionMiddleware
from starlette.requests import Request
import httpx
import os
import urllib.parse
from dotenv import load_dotenv

load_dotenv()

# SSO CONFIGURATION (PLACEHOLDERS - USER MUST UPDATE)
# SSO CONFIGURATION
CLIENT_ID = os.getenv("CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET")
TENANT_ID = os.getenv("TENANT_ID")
REDIRECT_URI = os.getenv("REDIRECT_URI")
REDIRECT_FRONTEND = os.getenv("REDIRECT_FRONTEND")
AUTHORITY = os.getenv("AUTHORITY", f"https://login.microsoftonline.com/{TENANT_ID}")
SCOPE = ["User.Read"]

app = FastAPI()

# Session Middleware for managing login state
# Session Middleware for managing login state
app.add_middleware(SessionMiddleware, secret_key=os.getenv("SESSION_SECRET", "super-secret-key-default"), https_only=True, same_site="lax")

# ... (CORS Middleware) ...
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from .jobs import start_daily_scheduler
import asyncio

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(start_daily_scheduler())

# ---------------- API ENDPOINTS ----------------

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    print(f"CRITICAL ERROR: {exc}")
    import traceback
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"message": "Internal Server Error", "detail": str(exc), "trace": traceback.format_exc()}
    )

@app.get("/login")
def login():
    # Construct Auth URL
    params = {
        "client_id": CLIENT_ID,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
        "scope": " ".join(SCOPE),
        "response_mode": "query"
    }
    url = f"{AUTHORITY}/oauth2/v2.0/authorize?{urllib.parse.urlencode(params)}"
    print(f"DEBUG: Login Redirecting to: {url}")
    return RedirectResponse(url=url)

@app.get("/auth/callback")
async def callback(request: Request, code: str = None, error: str = None):
    print(f"DEBUG: Callback received. Code: {code[:10] if code else 'None'}, Error: {error}")
    if error:
        return JSONResponse({"error": error, "details": "Azure Auth Failed"})
    
    if not code:
        return JSONResponse({"error": "No code provided"})

    # SSL Verification: False to handle potential corporate proxy interception
    async with httpx.AsyncClient(verify=False) as client:
        # 1. Exchange Code for Token
        token_url = f"{AUTHORITY}/oauth2/v2.0/token"
        token_data = {
            "client_id": CLIENT_ID,
            "scope": " ".join(SCOPE),
            "code": code,
            "redirect_uri": REDIRECT_URI,
            "grant_type": "authorization_code",
            "client_secret": CLIENT_SECRET,
        }
        res = await client.post(token_url, data=token_data)
        if res.status_code != 200:
            print(f"DEBUG: Token Exchange Failed: {res.text}")
            return JSONResponse({"error": "Token Exchange Failed", "details": res.text}, status_code=500)
        
        tokens = res.json()
        access_token = tokens.get("access_token")

        # 2. Get User Profile from Graph
        me_res = await client.get(
            "https://graph.microsoft.com/v1.0/me",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        if me_res.status_code != 200:
            print(f"DEBUG: Graph API Failed: {me_res.text}")
            return JSONResponse({"error": "Graph API Failed", "details": me_res.text}, status_code=500)

        user_profile = me_res.json()
        print(f"DEBUG: User Authenticated: {user_profile.get('mail')}")
        
        # 3. Store in Session
        request.session["user"] = {
            "name": user_profile.get("displayName"),
            "email": user_profile.get("mail") or user_profile.get("userPrincipalName"),
            "id": user_profile.get("id")
        }
        print(f"DEBUG: Session set: {request.session['user']}")

    # Redirect to Frontend Home
    return RedirectResponse(url=REDIRECT_FRONTEND) # Redirect to Frontend


@app.get("/logout")
def logout(request: Request):
    request.session.clear()
    # Optional: Redirect to Microsoft Logout
    # logout_url = f"{AUTHORITY}/oauth2/v2.0/logout?post_logout_redirect_uri=http://localhost:5173"
    # return RedirectResponse(logout_url)
    return RedirectResponse(url="/")




def build_user_hierarchy(db: Session, employee_id: int):
    """
    Returns (is_manager, manages_list_of_names, managed_ids_list)
    """
    hierarchy_query = text("""
        WITH RECURSIVE subordinates AS (
            SELECT id, name FROM employees 
            WHERE manager_id = :mid
            UNION
            SELECT e.id, e.name FROM employees e
            INNER JOIN subordinates s ON e.manager_id = s.id
        )
        SELECT id, name FROM subordinates;
    """)
    res_m = db.execute(hierarchy_query, {"mid": employee_id})
    rows = res_m.fetchall()
    
    managed_ids = [r[0] for r in rows]
    manages_names = [r[1] for r in rows]
    is_manager = len(managed_ids) > 0
    
    return is_manager, manages_names, managed_ids

@app.get("/api/me")
def get_current_user(request: Request, db: Session = Depends(get_db)):
    user = request.session.get("user")
    if user:
        email = user.get("email")
        # Enforce Email Lowercase for consistency
        if email: email = email.lower()
        
        is_manager = False
        manages = []
        managed_ids = []
        employee_id = None
        db_name = None
        is_admin = False
        
        # Hardcoded Admin Check
        ADMIN_EMAILS = ["weslley.bonifacio@bnf.bank", "weslley.bonifacio@example.com"]
        if email in ADMIN_EMAILS:
            is_admin = True
        
        print(f"DEBUG: /api/me - Email: {email}, Is Admin: {is_admin}")
        
        if email:
            try:
                # 1. Find Employee by Email
                res = db.execute(text("SELECT * FROM employees WHERE email = :email"), {"email": email})
                emp = res.fetchone()
                
                if emp:
                    emp_data = emp._mapping
                    employee_id = emp_data["id"]
                    db_name = emp_data["name"]
                    
                    # 2. Use Centralized Hierarchy Logic
                    is_manager, manages, managed_ids = build_user_hierarchy(db, employee_id)
                    print(f"DEBUG: build_user_hierarchy result for {employee_id}: is_manager={is_manager}, manages={manages}, managed_ids={managed_ids}")
                
            except Exception as e:
                print(f"Error resolving user details: {e}")

        # Admin Exception: Allow self-management
        if is_admin and employee_id:
            is_manager = True
            if employee_id not in managed_ids:
                managed_ids.append(employee_id)
            # Add name if not present (heuristic)
            my_name = db_name or user.get("name")
            if my_name and my_name not in manages:
                manages.append(my_name)
            
            print(f"DEBUG: Admin Override for {email}. is_manager=True, Self added to manages.")

        # Enrich User Object
        enriched_user = {
            **user,
            "employee_id": employee_id,
            "is_manager": is_manager,
            "manages": manages,
            "managed_ids": managed_ids,
            "is_admin": is_admin
        }
        if db_name:
            enriched_user["name"] = db_name # Override SSO name with DB name

        return {
            "authenticated": True,
            "user": enriched_user
        }
    return {"authenticated": False}

@app.get("/api/user-context/{employee_id}")
def get_user_context(employee_id: int, request: Request, db: Session = Depends(get_db)):
    # Security: In a real app, check if requester.is_admin. 
    # For now, we rely on the UI hiding this feature.
    
    # Fetch target employee
    res = db.execute(text("SELECT * FROM employees WHERE id = :id"), {"id": employee_id})
    emp = res.fetchone()
    
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
        
    emp_data = emp._mapping
    
    # Build hierarchy for target
    is_manager, manages, managed_ids = build_user_hierarchy(db, emp_data['id'])
    
    # Construct User object compliant with Frontend 'User' interface
    user_context = {
        "name": emp_data['name'],
        "email": emp_data['email'],
        "employee_id": emp_data['id'],
        "is_manager": is_manager,
        "manages": manages,
        "managed_ids": managed_ids,
        "is_admin": False # Impersonated users are never admins in this context
    }
    
    return user_context


@app.get("/api/employees", response_model=EmployeeResponse)
def get_employees(db: Session = Depends(get_db)):
    try:
        # Return full employee objects for hierarchy building
        result = db.execute(text("SELECT * FROM employees ORDER BY name"))
        employees = [row._mapping for row in result]
        return {"message": "success", "data": employees}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/events", response_model=EventResponse)
def get_events(db: Session = Depends(get_db)):
    try:
        # Join events with employees to return employee_name as expected by Frontend
        sql = """
            SELECT e.*, emp.name as employee_name
            FROM events e
            LEFT JOIN employees emp ON e.employee_id = emp.id
            ORDER BY e.date, e.start_time, emp.name
        """
        result = db.execute(text(sql))
        # Convert to dict for Pydantic
        events = []
        for row in result:
            # Row mapping (SQLAlchemy 1.4/2.0+ returns KeyedTuple-like)
            d = row._mapping
            events.append(d)
            
        return {"message": "success", "data": events}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/holidays", response_model=HolidayResponse)
def get_holidays(db: Session = Depends(get_db)):
    try:
        result = db.execute(text("SELECT * FROM holidays ORDER BY date"))
        holidays = [row._mapping for row in result]
        return {"message": "success", "data": holidays}
    except Exception as e:
         return {"message": "success", "data": []}

@app.get("/api/leave-data", response_model=LeaveDataResponse)
def get_leave_data(db: Session = Depends(get_db)):
    try:
        # Return yearly_balances joined with employees if needed, or just as is
        # Schema: employee_id, year, type, value...
        # Frontend likely expects 'employee_name'? Node code: "SELECT * FROM yearly_balances"
        # Since we changed schema, we better check if frontend needs name.
        # User said: "return the same JSON". Node API returned 'yearly_balances' rows.
        # If 'yearly_balances' in SQLite had 'employee_name', then yes we must return it.
        # Our Refined DB does NOT have employee_name in yearly_balances.
        sql = """
            SELECT yb.*, emp.name as employee_name
            FROM yearly_balances yb
            LEFT JOIN employees emp ON yb.employee_id = emp.id
        """
        result = db.execute(text(sql))
        data = [dict(row._mapping) for row in result]
        return {"message": "success", "data": data}
    except Exception as e:
        print(f"Error in get_leave_data: {e}")
        return {"message": "success", "data": []}

from .crud import save_events_logic, approve_events_logic, reject_events_logic

@app.post("/api/recurrences")
async def api_create_recurrence(request: Request, db: Session = Depends(get_db)):
    data = await request.json()
    # data: { employee_id, type, start_date, end_date, start_time, finish_time, days_of_week }
    # days_of_week: "1,3,5" (Mon,Wed,Fri)
    
    user = request.session.get("user")
    if not user: return JSONResponse({"detail": "Unauthorized"}, status_code=401)
    
    # Delegate to CRUD
    try:
        from backend.crud import create_recurrence
        res = create_recurrence(db, data, user)
        return {"status": "ok", "message": f"Created {res['count']} events", "recurrence_id": res['id']}
    except Exception as e:
        print(f"Recurrence Error: {e}")
        return JSONResponse({"detail": str(e)}, status_code=500)

@app.get("/api/recurrences/{id}")
async def api_get_recurrence(id: int, request: Request, db: Session = Depends(get_db)):
    user = request.session.get("user")
    if not user: return JSONResponse({"detail": "Unauthorized"}, status_code=401)
    
    res = db.execute(text("SELECT * FROM recurrences WHERE id = :id"), {"id": id}).mappings().fetchone()
    if not res:
        return JSONResponse({"detail": "Recurrence not found"}, status_code=404)
        
    # Convert dates to string
    data = dict(res)
    for k, v in data.items():
        if hasattr(v, 'isoformat'): data[k] = v.isoformat()
        
    return data

@app.post("/api/save-events")
def save_events(events: List[Dict[str, Any]], db: Session = Depends(get_db)):
    try:
        save_events_logic(db, events)
        return {"message": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/approve-events")
def approve_events(payload: Dict[str, List[int]], db: Session = Depends(get_db)):
    try:
        ids = payload.get('ids', [])
        approve_events_logic(db, ids)
        return {"message": "success"}
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/reject-events")
def reject_events(payload: Dict[str, List[int]], db: Session = Depends(get_db)):
    try:
        ids = payload.get('ids', [])
        reject_events_logic(db, ids)
        return {"message": "success"}
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))

