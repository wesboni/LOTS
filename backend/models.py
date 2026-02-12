from pydantic import BaseModel
from typing import Optional, List, Any, Union
from datetime import date

# Events Model (Input/Output)
class EventBase(BaseModel):
    employee_name: Optional[str] = None # For compatibility with Node API
    type: Optional[str] = None
    date: Optional[str] = None
    start_time: Optional[str] = None
    finish_time: Optional[str] = None
    duration: Optional[float] = None
    comment: Optional[str] = None
    situation: Optional[str] = None
    status: Optional[str] = None
    original_data: Optional[str] = None
    duration_time: Optional[str] = None
    duration_hour: Optional[float] = None

class Event(EventBase):
    id: int
    employee_id: Optional[int] = None # Added via refinement

    class Config:
        from_attributes = True

# Response Wrapper
class EventResponse(BaseModel):
    message: str
    data: List[Event]

    data: List[Event]

class Employee(BaseModel):
    id: int
    employee_number: Optional[int] = None
    name: str
    email: Optional[str] = None
    manager_id: Optional[int] = None
    department: Optional[str] = None
    mobile_phone: Optional[str] = None
    date_of_birth: Optional[date] = None
    date_of_employment: Optional[date] = None
    date_of_termination: Optional[date] = None
    
    class Config:
        from_attributes = True

class EmployeeResponse(BaseModel):
    message: str
    data: List[Employee]

class LeaveDataResponse(BaseModel):
    message: str
    data: List[Any]

class Holiday(BaseModel):
    id: int
    date: str
    description: str
    type: Optional[str] = None

    class Config:
        from_attributes = True

class HolidayResponse(BaseModel):
    message: str
    data: List[Holiday]
