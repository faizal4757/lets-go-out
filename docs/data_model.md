# Data Model – lets-go-out (MVP)

This document defines the MVP data model for the lets-go-out application.
The model supports hosting physical and virtual outings and managing interest requests.

---

## User

Represents a person using the platform.

Fields:
- id: unique identifier
- display_name: name shown to others
- created_at: timestamp of creation

Notes:
- No authentication in MVP
- Users may be created implicitly

---

## Outing

Represents an activity hosted by a user.

Fields:
- id: unique identifier
- title: short description of the outing
- description: optional details
- outing_mode: physical or virtual
- activity_type: movie, coffee, sports, etc.
- location: required for physical outings
- virtual_link: required for virtual outings
- date_time: when the outing occurs
- host_user_id: user who created the outing
- status: open or closed
- created_at: timestamp

Business Rules:
- Physical outings require location
- Virtual outings require virtual_link

---

## InterestRequest

Represents a user's request to join an outing.

Fields:
- id: unique identifier
- outing_id: reference to the outing
- requester_user_id: user requesting to join
- status: pending, accepted, or rejected
- created_at: timestamp

Constraints:
- One interest request per user per outing
