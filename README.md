# Restaurant Table Reservation & Food Service Management System

A comprehensive relational database management system designed to coordinate table booking, order capture, kitchen processing, billing, and payment processing for a restaurant[cite: 1, 3].

---

## 📋 Table of Contents
* [Overview](#overview)
* [System Architecture & ER Diagram](#system-architecture--er-diagram)
* [Relational Schema (3NF)](#relational-schema-3nf)
* [User Roles & Scope](#user-roles--scope)
* [Key Business Rules & Constraints](#key-business-rules--constraints)
* [Sample Queries & Reports](#sample-queries--reports)
* [Tech Stack & Project Structure](#tech-stack--project-structure)

---

## 🔍 Overview
* The **Restaurant Table Reservation & Food Service Management System** eliminates traditional paper-based bottlenecks such as double-booked tables, lost kitchen orders, delayed service, and inaccurate billing[cite: 3].
* It models the complete restaurant lifecycle from a customer's initial reservation to the final payment[cite: 3, 6].

---

## 📊 System Architecture & ER Diagram
* The conceptual design consists of master/reference entities and transaction/event entities linked with clear cardinality ($1:1$, $1:N$, $M:N$)[cite: 6].
* **Process Flow:** Start $\rightarrow$ Make Reservation (optional) $\rightarrow$ Assign Dining Table $\rightarrow$ Place Order (waiter) $\rightarrow$ Send to Kitchen (generate ticket) $\rightarrow$ Food Prepared and Served $\rightarrow$ Generate Bill (apply discount) $\rightarrow$ Make Payment $\rightarrow$ End[cite: 2].

---

## 🗄️ Relational Schema (3NF)
The database has been normalized up to the **Third Normal Form (3NF)** to eliminate redundancy and update anomalies[cite: 1, 3, 7]:

* **`DINING_AREA`** (`area_id` PK, `area_name`, `floor_no`)[cite: 2]
* **`DINING_TABLE`** (`table_id` PK, `area_id` FK, `table_no` UNIQUE, `capacity`, `status`)[cite: 2]
* **`CUSTOMER`** (`customer_id` PK, `full_name`, `phone` UNIQUE, `email`)[cite: 2]
* **`WAITER`** (`waiter_id` PK, `full_name`, `shift`)[cite: 2]
* **`RESERVATION`** (`reservation_id` PK, `customer_id` FK, `table_id` FK, `start_time`, `end_time`, `guest_count`, `res_status`)[cite: 2]
* **`MENU_ITEM`** (`item_id` PK, `item_name`, `category`, `price`)[cite: 2]
* **`ORDERS`** (`order_id` PK, `table_id` FK, `waiter_id` FK, `order_time`, `order_status`)[cite: 2]
* **`ORDER_ITEM`** (`order_item_id` PK, `order_id` FK, `item_id` FK, `quantity`, `unit_price`)[cite: 2]
* **`KITCHEN_TICKET`** (`ticket_id` PK, `order_item_id` FK UNIQUE, `sent_time`, `ready_time`, `ticket_status`)[cite: 2]
* **`DISCOUNT`** (`discount_id` PK, `code` UNIQUE, `percent`, `authorized_by`)[cite: 2]
* **`BILL`** (`bill_id` PK, `order_id` FK UNIQUE, `discount_id` FK NULL, `subtotal`, `total_amount`, `bill_status`)[cite: 2]
* **`PAYMENT`** (`payment_id` PK, `bill_id` FK, `amount_paid`, `pay_method`, `pay_time`)[cite: 2]

---

## 👥 User Roles & Scope

### In-Scope Modules[cite: 4]
* **Receptionist:** Creates and manages reservations, assigns tables, and checks availability[cite: 4].
* **Waiter:** Takes orders, updates serving status, and assists with billing[cite: 4].
* **Kitchen Staff:** Views kitchen tickets and updates preparation status[cite: 4].
* **Cashier / Manager:** Applies discounts, closes bills, records payments, and views reports[cite: 4].

### Out-of-Scope (Phase 1)[cite: 4]
* Online and third-party delivery integration[cite: 4]
* Inventory and supplier procurement modules[cite: 4]
* Loyalty programs and CRM marketing modules[cite: 4]
* Multi-branch chain consolidation[cite: 4]

---

## 🔒 Key Business Rules & Constraints
Data integrity is strictly maintained via RDBMS constraints and triggers:
* **No Overlapping Reservations:** Prevents booking the same table for conflicting time windows[cite: 1, 8].
* **Capacity Validation:** Guest counts must not exceed the table capacity (`CHECK` constraint)[cite: 1, 8].
* **Positive Quantities:** Order item quantities must be greater than zero (`CHECK quantity > 0`)[cite: 8].
* **Authorized Discounts:** Discounts require an authorized reference (`NOT NULL` foreign key)[cite: 8].
* **Immutable Closed Bills:** Once a bill is closed, no further edits are permitted once `is_closed = TRUE`[cite: 1, 8].

---

## 📈 Sample Queries & Reports

### 1. Available Tables Right Now
```sql
SELECT dt.table_no, dt.capacity 
FROM DINING_TABLE dt 
WHERE dt.status = 'Available' 
ORDER BY dt.capacity;
```[cite: 5]

### 2. Waiter Performance (Revenue Served)
```sql
SELECT w.full_name, COUNT(o.order_id) AS orders, SUM(b.total_amount) AS revenue 
FROM WAITER w 
JOIN ORDERS o ON o.waiter_id = w.waiter_id 
JOIN BILL b ON b.order_id = o.order_id 
GROUP BY w.full_name 
ORDER BY revenue DESC;
```[cite: 5]

### 3. Items Never Ordered (Nested Query)
```sql
SELECT item_name 
FROM MENU_ITEM 
WHERE item_id NOT IN (
    SELECT item_id FROM ORDER_ITEM
);
```[cite: 5]

---

## 🛠️ Tech Stack & Project Structure
* **Database Management System:** MySQL / PostgreSQL / Oracle[cite: 8]
* **Backend Application Layer:** Java / Python[cite: 3]
* **Frontend:** Web UI Dashboard (HTML/CSS/JS)[cite: 1]
