const express = require('express');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'restaurant_management',
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10
};

let pool = null;
let useFallback = false;

// In-memory fallback dataset initialized with schema seed data
const memDb = {
  dining_area: [
    { area_id: 1, area_name: 'Main Hall', floor_no: 1 },
    { area_id: 2, area_name: 'Garden Area', floor_no: 1 },
    { area_id: 3, area_name: 'Rooftop', floor_no: 2 }
  ],
  dining_table: [
    { table_id: 1, area_id: 1, table_no: 101, capacity: 2, status: 'Available' },
    { table_id: 2, area_id: 1, table_no: 102, capacity: 4, status: 'Occupied' },
    { table_id: 3, area_id: 1, table_no: 103, capacity: 6, status: 'Reserved' },
    { table_id: 4, area_id: 2, table_no: 201, capacity: 4, status: 'Available' },
    { table_id: 5, area_id: 2, table_no: 202, capacity: 6, status: 'Available' },
    { table_id: 6, area_id: 3, table_no: 301, capacity: 4, status: 'Reserved' },
    { table_id: 7, area_id: 3, table_no: 302, capacity: 8, status: 'Available' }
  ],
  customer: [
    { customer_id: 1, full_name: 'Rahul Sharma', phone: '9876543210', email: 'rahul@gmail.com' },
    { customer_id: 2, full_name: 'Priya Reddy', phone: '9876501234', email: 'priya@gmail.com' },
    { customer_id: 3, full_name: 'Arjun Kumar', phone: '9988776655', email: 'arjun@gmail.com' },
    { customer_id: 4, full_name: 'Sneha Patel', phone: '9123456789', email: 'sneha@gmail.com' },
    { customer_id: 5, full_name: 'Vikram Singh', phone: '9012345678', email: 'vikram@gmail.com' }
  ],
  waiter: [
    { waiter_id: 1, full_name: 'Amit Kumar', shift: 'Morning' },
    { waiter_id: 2, full_name: 'Neha Sharma', shift: 'Evening' },
    { waiter_id: 3, full_name: 'Ravi Patel', shift: 'Morning' },
    { waiter_id: 4, full_name: 'Anjali Rao', shift: 'Night' }
  ],
  menu_item: [
    { item_id: 1, item_name: 'Paneer Tikka', category: 'Starter', price: 220 },
    { item_id: 2, item_name: 'Chicken Biryani', category: 'Main Course', price: 280 },
    { item_id: 3, item_name: 'Veg Biryani', category: 'Main Course', price: 220 },
    { item_id: 4, item_name: 'Butter Naan', category: 'Bread', price: 50 },
    { item_id: 5, item_name: 'Dal Tadka', category: 'Main Course', price: 180 },
    { item_id: 6, item_name: 'Masala Dosa', category: 'South Indian', price: 140 },
    { item_id: 7, item_name: 'Cold Coffee', category: 'Beverage', price: 120 },
    { item_id: 8, item_name: 'Fresh Lime Soda', category: 'Beverage', price: 80 },
    { item_id: 9, item_name: 'Gulab Jamun', category: 'Dessert', price: 100 },
    { item_id: 10, item_name: 'Ice Cream', category: 'Dessert', price: 120 }
  ],
  reservation: [
    { reservation_id: 1, customer_id: 1, table_id: 3, start_time: '2026-09-21 19:00:00', end_time: '2026-09-21 21:00:00', guest_count: 5, res_status: 'Confirmed' },
    { reservation_id: 2, customer_id: 2, table_id: 6, start_time: '2026-09-21 20:00:00', end_time: '2026-09-21 22:00:00', guest_count: 4, res_status: 'Confirmed' },
    { reservation_id: 3, customer_id: 3, table_id: 4, start_time: '2026-09-22 13:00:00', end_time: '2026-09-22 14:30:00', guest_count: 3, res_status: 'Confirmed' },
    { reservation_id: 4, customer_id: 4, table_id: 5, start_time: '2026-09-22 19:30:00', end_time: '2026-09-22 21:30:00', guest_count: 6, res_status: 'Pending' },
    { reservation_id: 5, customer_id: 5, table_id: 2, start_time: '2026-09-23 20:00:00', end_time: '2026-09-23 22:00:00', guest_count: 4, res_status: 'Confirmed' }
  ],
  orders: [
    { order_id: 1, table_id: 2, waiter_id: 1, order_time: '2026-09-21 12:30:00', order_status: 'Completed' },
    { order_id: 2, table_id: 3, waiter_id: 2, order_time: '2026-09-21 19:15:00', order_status: 'Preparing' },
    { order_id: 3, table_id: 6, waiter_id: 4, order_time: '2026-09-21 20:10:00', order_status: 'Pending' },
    { order_id: 4, table_id: 4, waiter_id: 3, order_time: '2026-09-22 13:15:00', order_status: 'Completed' },
    { order_id: 5, table_id: 5, waiter_id: 2, order_time: '2026-09-22 19:45:00', order_status: 'Preparing' }
  ],
  order_item: [
    { order_item_id: 1, order_id: 1, item_id: 1, quantity: 2, unit_price: 220 },
    { order_item_id: 2, order_id: 1, item_id: 2, quantity: 2, unit_price: 280 },
    { order_item_id: 3, order_id: 1, item_id: 4, quantity: 4, unit_price: 50 },
    { order_item_id: 4, order_id: 2, item_id: 1, quantity: 1, unit_price: 220 },
    { order_item_id: 5, order_id: 2, item_id: 2, quantity: 2, unit_price: 280 },
    { order_item_id: 6, order_id: 2, item_id: 7, quantity: 2, unit_price: 120 },
    { order_item_id: 7, order_id: 3, item_id: 3, quantity: 2, unit_price: 220 },
    { order_item_id: 8, order_id: 3, item_id: 4, quantity: 4, unit_price: 50 },
    { order_item_id: 9, order_id: 4, item_id: 6, quantity: 2, unit_price: 140 },
    { order_item_id: 10, order_id: 4, item_id: 8, quantity: 2, unit_price: 80 },
    { order_item_id: 11, order_id: 5, item_id: 5, quantity: 2, unit_price: 180 },
    { order_item_id: 12, order_id: 5, item_id: 9, quantity: 2, unit_price: 100 },
    { order_item_id: 13, order_id: 5, item_id: 7, quantity: 2, unit_price: 120 }
  ],
  discount: [
    { discount_id: 1, code: 'WELCOME10', percent: 10, authorized_by: 1 },
    { discount_id: 2, code: 'FAMILY15', percent: 15, authorized_by: 2 },
    { discount_id: 3, code: 'WEEKEND20', percent: 20, authorized_by: 4 }
  ],
  bill: [
    { bill_id: 1, order_id: 1, discount_id: 1, subtotal: 960, tax_amount: 48, total_amount: 912, bill_status: 'Paid' },
    { bill_id: 2, order_id: 2, discount_id: 2, subtotal: 1020, tax_amount: 51, total_amount: 918, bill_status: 'Unpaid' },
    { bill_id: 3, order_id: 3, discount_id: null, subtotal: 640, tax_amount: 32, total_amount: 672, bill_status: 'Unpaid' },
    { bill_id: 4, order_id: 4, discount_id: 1, subtotal: 440, tax_amount: 22, total_amount: 418, bill_status: 'Paid' },
    { bill_id: 5, order_id: 5, discount_id: 3, subtotal: 800, tax_amount: 40, total_amount: 680, bill_status: 'Unpaid' }
  ],
  payment: [
    { payment_id: 1, bill_id: 1, amount_paid: 912, pay_method: 'UPI', pay_time: '2026-09-21 13:30:00' },
    { payment_id: 2, bill_id: 4, amount_paid: 418, pay_method: 'Cash', pay_time: '2026-09-22 14:30:00' }
  ],
  kitchen_ticket: [
    { ticket_id: 1, order_item_id: 1, sent_time: '2026-09-21 12:35:00', ready_time: '2026-09-21 12:50:00', ticket_status: 'Ready' },
    { ticket_id: 2, order_item_id: 2, sent_time: '2026-09-21 12:35:00', ready_time: '2026-09-21 13:00:00', ticket_status: 'Ready' },
    { ticket_id: 3, order_item_id: 3, sent_time: '2026-09-21 12:36:00', ready_time: '2026-09-21 12:45:00', ticket_status: 'Ready' },
    { ticket_id: 4, order_item_id: 4, sent_time: '2026-09-21 19:20:00', ready_time: null, ticket_status: 'Preparing' },
    { ticket_id: 5, order_item_id: 5, sent_time: '2026-09-21 19:20:00', ready_time: null, ticket_status: 'Preparing' },
    { ticket_id: 6, order_item_id: 6, sent_time: '2026-09-21 19:21:00', ready_time: null, ticket_status: 'Preparing' },
    { ticket_id: 7, order_item_id: 7, sent_time: '2026-09-21 20:15:00', ready_time: null, ticket_status: 'Pending' },
    { ticket_id: 8, order_item_id: 8, sent_time: '2026-09-21 20:15:00', ready_time: null, ticket_status: 'Pending' },
    { ticket_id: 9, order_item_id: 9, sent_time: '2026-09-22 13:20:00', ready_time: '2026-09-22 13:35:00', ticket_status: 'Ready' },
    { ticket_id: 10, order_item_id: 10, sent_time: '2026-09-22 13:20:00', ready_time: '2026-09-22 13:30:00', ticket_status: 'Ready' },
    { ticket_id: 11, order_item_id: 11, sent_time: '2026-09-22 19:50:00', ready_time: null, ticket_status: 'Preparing' },
    { ticket_id: 12, order_item_id: 12, sent_time: '2026-09-22 19:50:00', ready_time: null, ticket_status: 'Preparing' },
    { ticket_id: 13, order_item_id: 13, sent_time: '2026-09-22 19:51:00', ready_time: null, ticket_status: 'Preparing' }
  ]
};

let nextId = {
  customer: 100,
  dining_table: 100,
  menu_item: 100,
  reservation: 100,
  orders: 100,
  order_item: 100,
  bill: 100,
  payment: 100,
  kitchen_ticket: 100,
  waiter: 100,
  dining_area: 100
};

// Database Initialization
async function initDb() {
  try {
    const rawConn = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      multipleStatements: true
    });

    const [rows] = await rawConn.query(
      "SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema=? AND table_name='kitchen_ticket'",
      [dbConfig.database]
    );

    if (!rows[0].count) {
      console.log('Database not fully seeded. Running schema.sql...');
      const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
      await rawConn.query(schemaSql);
      console.log('Schema created and seeded successfully.');
    }
    await rawConn.end();

    pool = mysql.createPool(dbConfig);
    // Test connection
    const [test] = await pool.query('SELECT 1');
    console.log('Connected to MySQL successfully.');
    useFallback = false;
  } catch (err) {
    console.warn('[Notice] MySQL not accessible (' + err.message + '). Starting in Standalone In-Memory mode.');
    useFallback = true;
  }
}

// Helper query function
const q = async (sql, params = []) => {
  if (useFallback || !pool) return [];
  const [results] = await pool.query(sql, params);
  return results;
};

// Error wrapper
const wrap = fn => async (req, res) => {
  try {
    const data = await fn(req, res);
    res.json(data);
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
};

// Format SQL string for client feedback
function formatSql(statement, params = []) {
  let s = statement;
  params.forEach(p => {
    const val = typeof p === 'string' ? `'${p.replace(/'/g, "''")}'` : (p === null ? 'NULL' : p);
    s = s.replace('?', val);
  });
  return s.trim() + ';';
}

// ---------------- API ENDPOINTS ----------------

// Health & System Info
app.get('/api/health', wrap(async () => {
  if (useFallback) {
    return { status: 'ok', db: 'in-memory-fallback', mode: 'standalone' };
  }
  await q('SELECT 1');
  return { status: 'ok', db: 'connected', mode: 'mysql' };
}));

// Dashboard Stats
app.get('/api/dashboard/stats', wrap(async () => {
  if (useFallback) {
    return {
      customers: memDb.customer.length,
      tables: memDb.dining_table.length,
      menu: memDb.menu_item.length,
      reservations: memDb.reservation.length,
      orders: memDb.orders.length,
      unpaidBills: memDb.bill.filter(b => (b.bill_status || '').toUpperCase() !== 'PAID').length
    };
  }

  const getCount = async table => {
    const res = await q(`SELECT COUNT(*) AS n FROM ${table}`);
    return res[0] ? res[0].n : 0;
  };

  let unpaid = 0;
  try {
    const billRes = await q("SELECT COUNT(*) AS n FROM bill WHERE UPPER(bill_status) <> 'PAID'");
    unpaid = billRes[0]?.n || 0;
  } catch {
    unpaid = 0;
  }

  return {
    customers: await getCount('customer'),
    tables: await getCount('dining_table'),
    menu: await getCount('menu_item'),
    reservations: await getCount('reservation'),
    orders: await getCount('orders'),
    unpaidBills: unpaid
  };
}));

// Aggregate Lookups for Form Select Dropdowns
app.get('/api/lookups', wrap(async () => {
  if (useFallback) {
    return {
      areas: memDb.dining_area,
      customers: memDb.customer,
      tables: memDb.dining_table.map(t => {
        const area = memDb.dining_area.find(a => a.area_id === t.area_id);
        return { ...t, area_name: area ? area.area_name : 'Unknown' };
      }),
      waiters: memDb.waiter,
      menu: memDb.menu_item,
      discounts: memDb.discount,
      orders: memDb.orders,
      bills: memDb.bill
    };
  }

  const [areas, customers, tables, waiters, menu, discounts, orders, bills] = await Promise.all([
    q('SELECT area_id, area_name, floor_no FROM dining_area ORDER BY area_id'),
    q('SELECT customer_id, full_name, phone FROM customer ORDER BY full_name'),
    q('SELECT t.table_id, t.table_no, t.capacity, t.status, a.area_name FROM dining_table t JOIN dining_area a ON a.area_id=t.area_id ORDER BY t.table_no'),
    q('SELECT waiter_id, full_name, shift FROM waiter ORDER BY full_name'),
    q('SELECT item_id, item_name, category, price FROM menu_item ORDER BY category, item_name'),
    q('SELECT discount_id, code, percent FROM discount ORDER BY code'),
    q('SELECT o.order_id, t.table_no, o.order_status, o.order_time FROM orders o JOIN dining_table t ON t.table_id=o.table_id ORDER BY o.order_id DESC'),
    q('SELECT b.bill_id, b.order_id, b.total_amount, b.bill_status FROM bill b ORDER BY b.bill_id DESC')
  ]);

  return { areas, customers, tables, waiters, menu, discounts, orders, bills };
}));

// ================= CUSTOMERS =================
app.get('/api/customers', wrap(async () => {
  if (useFallback) return [...memDb.customer].reverse();
  return q('SELECT * FROM customer ORDER BY customer_id DESC');
}));

app.post('/api/customers', wrap(async req => {
  const { full_name, phone, email } = req.body;
  if (!full_name || !phone) throw new Error('Full Name and Phone are required');

  if (useFallback) {
    const newCustomer = { customer_id: nextId.customer++, full_name, phone, email: email || null };
    memDb.customer.push(newCustomer);
    return {
      customer_id: newCustomer.customer_id,
      sql: `INSERT INTO customer (full_name, phone, email) VALUES ('${full_name}', '${phone}', '${email || ''}');`
    };
  }

  const sql = 'INSERT INTO customer (full_name, phone, email) VALUES (?, ?, ?)';
  const params = [full_name, phone, email || null];
  const [res] = await pool.query(sql, params);
  return { customer_id: res.insertId, sql: formatSql(sql, params) };
}));

app.delete('/api/customers/:id', wrap(async req => {
  const id = parseInt(req.params.id, 10);
  if (!id) throw new Error('Invalid customer ID');

  if (useFallback) {
    memDb.reservation = memDb.reservation.filter(r => r.customer_id !== id);
    memDb.customer = memDb.customer.filter(c => c.customer_id !== id);
    return { affected: 1, sql: `DELETE FROM customer WHERE customer_id = ${id};` };
  }

  // Cleanly cascade reservations before customer deletion
  await q('DELETE FROM reservation WHERE customer_id = ?', [id]);
  const res = await q('DELETE FROM customer WHERE customer_id = ?', [id]);
  return { affected: res.affectedRows, sql: `DELETE FROM customer WHERE customer_id = ${id};` };
}));

// ================= DINING TABLES =================
app.get('/api/tables', wrap(async () => {
  if (useFallback) {
    return memDb.dining_table.map(t => {
      const a = memDb.dining_area.find(area => area.area_id === t.area_id);
      return { ...t, area_name: a ? a.area_name : 'Unknown' };
    }).sort((a, b) => a.table_no - b.table_no);
  }
  return q('SELECT t.table_id, a.area_name, t.area_id, t.table_no, t.capacity, t.status FROM dining_table t JOIN dining_area a ON a.area_id=t.area_id ORDER BY t.table_no');
}));

app.post('/api/tables', wrap(async req => {
  const { area_id, table_no, capacity, status } = req.body;
  if (!table_no || !capacity) throw new Error('Table Number and Capacity are required');

  const areaId = parseInt(area_id, 10) || 1;
  const tableNo = parseInt(table_no, 10);
  const cap = parseInt(capacity, 10);
  const stat = status || 'Available';

  if (useFallback) {
    const newTable = { table_id: nextId.dining_table++, area_id: areaId, table_no: tableNo, capacity: cap, status: stat };
    memDb.dining_table.push(newTable);
    return {
      table_id: newTable.table_id,
      sql: `INSERT INTO dining_table (area_id, table_no, capacity, status) VALUES (${areaId}, ${tableNo}, ${cap}, '${stat}');`
    };
  }

  const sql = 'INSERT INTO dining_table (area_id, table_no, capacity, status) VALUES (?, ?, ?, ?)';
  const params = [areaId, tableNo, cap, stat];
  const [res] = await pool.query(sql, params);
  return { table_id: res.insertId, sql: formatSql(sql, params) };
}));

app.delete('/api/tables/:id', wrap(async req => {
  const id = parseInt(req.params.id, 10);
  if (!id) throw new Error('Invalid table ID');

  if (useFallback) {
    memDb.reservation = memDb.reservation.filter(r => r.table_id !== id);
    memDb.orders = memDb.orders.filter(o => o.table_id !== id);
    memDb.dining_table = memDb.dining_table.filter(t => t.table_id !== id);
    return { affected: 1, sql: `DELETE FROM dining_table WHERE table_id = ${id};` };
  }

  // Cascade dependent reservations and orders to prevent foreign key errors
  await q('DELETE FROM reservation WHERE table_id = ?', [id]);
  const orders = await q('SELECT order_id FROM orders WHERE table_id = ?', [id]);
  for (const o of orders) {
    await q('DELETE kt FROM kitchen_ticket kt JOIN order_item oi ON oi.order_item_id=kt.order_item_id WHERE oi.order_id=?', [o.order_id]);
    await q('DELETE FROM order_item WHERE order_id = ?', [o.order_id]);
    await q('DELETE p FROM payment p JOIN bill b ON b.bill_id=p.bill_id WHERE b.order_id=?', [o.order_id]);
    await q('DELETE FROM bill WHERE order_id = ?', [o.order_id]);
  }
  await q('DELETE FROM orders WHERE table_id = ?', [id]);
  const res = await q('DELETE FROM dining_table WHERE table_id = ?', [id]);
  return { affected: res.affectedRows, sql: `DELETE FROM dining_table WHERE table_id = ${id};` };
}));

// ================= MENU ITEMS =================
app.get('/api/menu', wrap(async () => {
  if (useFallback) return [...memDb.menu_item];
  return q('SELECT * FROM menu_item ORDER BY category, item_name');
}));

app.post('/api/menu', wrap(async req => {
  const { item_name, category, price } = req.body;
  if (!item_name || price === undefined || price === '') throw new Error('Item name and price are required');

  const cat = category || 'General';
  const pr = parseFloat(price);

  if (useFallback) {
    const newItem = { item_id: nextId.menu_item++, item_name, category: cat, price: pr };
    memDb.menu_item.push(newItem);
    return {
      item_id: newItem.item_id,
      sql: `INSERT INTO menu_item (item_name, category, price) VALUES ('${item_name}', '${cat}', ${pr});`
    };
  }

  const sql = 'INSERT INTO menu_item (item_name, category, price) VALUES (?, ?, ?)';
  const params = [item_name, cat, pr];
  const [res] = await pool.query(sql, params);
  return { item_id: res.insertId, sql: formatSql(sql, params) };
}));

app.delete('/api/menu/:id', wrap(async req => {
  const id = parseInt(req.params.id, 10);
  if (!id) throw new Error('Invalid item ID');

  if (useFallback) {
    memDb.kitchen_ticket = memDb.kitchen_ticket.filter(kt => {
      const oi = memDb.order_item.find(o => o.order_item_id === kt.order_item_id);
      return oi && oi.item_id !== id;
    });
    memDb.order_item = memDb.order_item.filter(oi => oi.item_id !== id);
    memDb.menu_item = memDb.menu_item.filter(m => m.item_id !== id);
    return { affected: 1, sql: `DELETE FROM menu_item WHERE item_id = ${id};` };
  }

  await q('DELETE kt FROM kitchen_ticket kt JOIN order_item oi ON oi.order_item_id=kt.order_item_id WHERE oi.item_id = ?', [id]);
  await q('DELETE FROM order_item WHERE item_id = ?', [id]);
  const res = await q('DELETE FROM menu_item WHERE item_id = ?', [id]);
  return { affected: res.affectedRows, sql: `DELETE FROM menu_item WHERE item_id = ${id};` };
}));

// ================= RESERVATIONS =================
app.get('/api/reservations', wrap(async () => {
  if (useFallback) {
    return memDb.reservation.map(r => {
      const c = memDb.customer.find(cust => cust.customer_id === r.customer_id) || {};
      const t = memDb.dining_table.find(tbl => tbl.table_id === r.table_id) || {};
      return {
        reservation_id: r.reservation_id,
        customer_id: r.customer_id,
        customer_name: c.full_name || 'Guest',
        phone: c.phone || '',
        table_id: r.table_id,
        table_no: t.table_no || 'TBD',
        start_time: r.start_time,
        end_time: r.end_time,
        guest_count: r.guest_count,
        res_status: r.res_status
      };
    }).reverse();
  }
  return q(`SELECT r.reservation_id, r.customer_id, c.full_name AS customer_name, c.phone,
                   r.table_id, t.table_no, r.start_time, r.end_time, r.guest_count, r.res_status
            FROM reservation r
            JOIN customer c ON c.customer_id = r.customer_id
            JOIN dining_table t ON t.table_id = r.table_id
            ORDER BY r.reservation_id DESC`);
}));

app.post('/api/reservations', wrap(async req => {
  const { customer_id, table_id, start_time, end_time, guest_count, res_status } = req.body;
  if (!customer_id || !table_id || !start_time || !guest_count) {
    throw new Error('Customer, Table, Start Time, and Guest Count are required');
  }

  const cid = parseInt(customer_id, 10);
  const tid = parseInt(table_id, 10);
  const guests = parseInt(guest_count, 10);
  const status = res_status || 'Confirmed';
  const start = start_time.replace('T', ' ');
  const end = end_time ? end_time.replace('T', ' ') : null;

  if (useFallback) {
    const newRes = {
      reservation_id: nextId.reservation++,
      customer_id: cid,
      table_id: tid,
      start_time: start,
      end_time: end,
      guest_count: guests,
      res_status: status
    };
    memDb.reservation.push(newRes);
    return {
      reservation_id: newRes.reservation_id,
      sql: `INSERT INTO reservation (customer_id, table_id, start_time, end_time, guest_count, res_status) VALUES (${cid}, ${tid}, '${start}', ${end ? `'${end}'` : 'NULL'}, ${guests}, '${status}');`
    };
  }

  const sql = 'INSERT INTO reservation (customer_id, table_id, start_time, end_time, guest_count, res_status) VALUES (?, ?, ?, ?, ?, ?)';
  const params = [cid, tid, start, end, guests, status];
  const [res] = await pool.query(sql, params);
  return { reservation_id: res.insertId, sql: formatSql(sql, params) };
}));

app.delete('/api/reservations/:id', wrap(async req => {
  const id = parseInt(req.params.id, 10);
  if (!id) throw new Error('Invalid reservation ID');

  if (useFallback) {
    memDb.reservation = memDb.reservation.filter(r => r.reservation_id !== id);
    return { affected: 1, sql: `DELETE FROM reservation WHERE reservation_id = ${id};` };
  }

  const res = await q('DELETE FROM reservation WHERE reservation_id = ?', [id]);
  return { affected: res.affectedRows, sql: `DELETE FROM reservation WHERE reservation_id = ${id};` };
}));

// ================= ORDERS =================
app.get('/api/orders', wrap(async () => {
  if (useFallback) {
    return memDb.orders.map(o => {
      const t = memDb.dining_table.find(tbl => tbl.table_id === o.table_id) || {};
      const w = memDb.waiter.find(wt => wt.waiter_id === o.waiter_id) || {};
      const items = memDb.order_item.filter(oi => oi.order_id === o.order_id);
      const total = items.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0);
      return {
        order_id: o.order_id,
        table_id: o.table_id,
        table_no: t.table_no || 'TBD',
        waiter_id: o.waiter_id,
        waiter_name: w.full_name || 'Staff',
        order_time: o.order_time,
        order_status: o.order_status,
        items_count: items.length,
        total_amount: total
      };
    }).reverse();
  }

  return q(`SELECT o.order_id, o.table_id, t.table_no, o.waiter_id, w.full_name AS waiter_name,
                   o.order_time, o.order_status,
                   COUNT(oi.order_item_id) AS items_count,
                   COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_amount
            FROM orders o
            JOIN dining_table t ON t.table_id = o.table_id
            JOIN waiter w ON w.waiter_id = o.waiter_id
            LEFT JOIN order_item oi ON oi.order_id = o.order_id
            GROUP BY o.order_id, o.table_id, t.table_no, o.waiter_id, w.full_name, o.order_time, o.order_status
            ORDER BY o.order_id DESC`);
}));

app.post('/api/orders', wrap(async req => {
  const { table_id, waiter_id, order_status, order_time, item_id, quantity } = req.body;
  if (!table_id || !waiter_id) throw new Error('Table and Waiter are required');

  const tid = parseInt(table_id, 10);
  const wid = parseInt(waiter_id, 10);
  const status = order_status || 'Pending';
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const oTime = order_time ? order_time.replace('T', ' ') : now;

  if (useFallback) {
    const newOrder = { order_id: nextId.orders++, table_id: tid, waiter_id: wid, order_time: oTime, order_status: status };
    memDb.orders.push(newOrder);

    // If an initial item was provided, add order_item and kitchen_ticket
    if (item_id && quantity) {
      const item = memDb.menu_item.find(m => m.item_id === parseInt(item_id, 10));
      if (item) {
        const oiId = nextId.order_item++;
        memDb.order_item.push({
          order_item_id: oiId,
          order_id: newOrder.order_id,
          item_id: item.item_id,
          quantity: parseInt(quantity, 10),
          unit_price: item.price
        });
        memDb.kitchen_ticket.push({
          ticket_id: nextId.kitchen_ticket++,
          order_item_id: oiId,
          sent_time: oTime,
          ready_time: null,
          ticket_status: 'Pending'
        });
      }
    }
    return {
      order_id: newOrder.order_id,
      sql: `INSERT INTO orders (table_id, waiter_id, order_time, order_status) VALUES (${tid}, ${wid}, '${oTime}', '${status}');`
    };
  }

  const sql = 'INSERT INTO orders (table_id, waiter_id, order_time, order_status) VALUES (?, ?, ?, ?)';
  const params = [tid, wid, oTime, status];
  const [res] = await pool.query(sql, params);
  const orderId = res.insertId;

  // Insert initial item if selected
  if (item_id && quantity) {
    const [menu] = await pool.query('SELECT price FROM menu_item WHERE item_id = ?', [item_id]);
    if (menu.length) {
      const unitPrice = menu[0].price;
      const [oiRes] = await pool.query(
        'INSERT INTO order_item (order_id, item_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
        [orderId, item_id, parseInt(quantity, 10), unitPrice]
      );
      await pool.query(
        'INSERT INTO kitchen_ticket (order_item_id, sent_time, ticket_status) VALUES (?, ?, ?)',
        [oiRes.insertId, oTime, 'Pending']
      );
    }
  }

  return { order_id: orderId, sql: formatSql(sql, params) };
}));

app.delete('/api/orders/:id', wrap(async req => {
  const id = parseInt(req.params.id, 10);
  if (!id) throw new Error('Invalid order ID');

  if (useFallback) {
    memDb.kitchen_ticket = memDb.kitchen_ticket.filter(kt => {
      const oi = memDb.order_item.find(o => o.order_item_id === kt.order_item_id);
      return oi && oi.order_id !== id;
    });
    memDb.order_item = memDb.order_item.filter(oi => oi.order_id !== id);
    const bills = memDb.bill.filter(b => b.order_id === id);
    bills.forEach(b => {
      memDb.payment = memDb.payment.filter(p => p.bill_id !== b.bill_id);
    });
    memDb.bill = memDb.bill.filter(b => b.order_id !== id);
    memDb.orders = memDb.orders.filter(o => o.order_id !== id);
    return { affected: 1, sql: `DELETE FROM orders WHERE order_id = ${id};` };
  }

  // Safe cascaded removal of tickets, items, payments, bills and order
  await q('DELETE kt FROM kitchen_ticket kt JOIN order_item oi ON oi.order_item_id=kt.order_item_id WHERE oi.order_id = ?', [id]);
  await q('DELETE FROM order_item WHERE order_id = ?', [id]);
  await q('DELETE p FROM payment p JOIN bill b ON b.bill_id=p.bill_id WHERE b.order_id = ?', [id]);
  await q('DELETE FROM bill WHERE order_id = ?', [id]);
  const res = await q('DELETE FROM orders WHERE order_id = ?', [id]);
  return { affected: res.affectedRows, sql: `DELETE FROM orders WHERE order_id = ${id};` };
}));

// ================= BILLS =================
app.get('/api/bills', wrap(async () => {
  if (useFallback) {
    return memDb.bill.map(b => {
      const ord = memDb.orders.find(o => o.order_id === b.order_id) || {};
      const tbl = memDb.dining_table.find(t => t.table_id === ord.table_id) || {};
      const disc = memDb.discount.find(d => d.discount_id === b.discount_id);
      return {
        bill_id: b.bill_id,
        order_id: b.order_id,
        table_no: tbl.table_no || '—',
        discount_id: b.discount_id,
        discount_code: disc ? disc.code : null,
        discount_percent: disc ? disc.percent : 0,
        subtotal: b.subtotal,
        tax_amount: b.tax_amount,
        total_amount: b.total_amount,
        bill_status: b.bill_status
      };
    }).reverse();
  }

  return q(`SELECT b.bill_id, b.order_id, t.table_no, b.discount_id, d.code AS discount_code,
                   d.percent AS discount_percent, b.subtotal, b.tax_amount, b.total_amount, b.bill_status
            FROM bill b
            JOIN orders o ON o.order_id = b.order_id
            JOIN dining_table t ON t.table_id = o.table_id
            LEFT JOIN discount d ON d.discount_id = b.discount_id
            ORDER BY b.bill_id DESC`);
}));

app.post('/api/bills', wrap(async req => {
  const { order_id, discount_id, subtotal, tax_amount, total_amount, bill_status } = req.body;
  if (!order_id || subtotal === undefined) throw new Error('Order and Subtotal are required');

  const oid = parseInt(order_id, 10);
  const did = discount_id ? parseInt(discount_id, 10) : null;
  const sub = parseFloat(subtotal);
  const tax = tax_amount !== undefined ? parseFloat(tax_amount) : Math.round(sub * 0.05 * 100) / 100;
  const tot = total_amount !== undefined ? parseFloat(total_amount) : sub + tax;
  const stat = bill_status || 'Unpaid';

  if (useFallback) {
    const existing = memDb.bill.find(b => b.order_id === oid);
    if (existing) throw new Error(`A bill already exists for Order #${oid}`);
    const newBill = { bill_id: nextId.bill++, order_id: oid, discount_id: did, subtotal: sub, tax_amount: tax, total_amount: tot, bill_status: stat };
    memDb.bill.push(newBill);
    return {
      bill_id: newBill.bill_id,
      sql: `INSERT INTO bill (order_id, discount_id, subtotal, tax_amount, total_amount, bill_status) VALUES (${oid}, ${did || 'NULL'}, ${sub}, ${tax}, ${tot}, '${stat}');`
    };
  }

  // Check if bill for order already exists
  const existing = await q('SELECT bill_id FROM bill WHERE order_id = ?', [oid]);
  if (existing.length) throw new Error(`A bill (Bill #${existing[0].bill_id}) already exists for Order #${oid}`);

  const sql = 'INSERT INTO bill (order_id, discount_id, subtotal, tax_amount, total_amount, bill_status) VALUES (?, ?, ?, ?, ?, ?)';
  const params = [oid, did, sub, tax, tot, stat];
  const [res] = await pool.query(sql, params);
  return { bill_id: res.insertId, sql: formatSql(sql, params) };
}));

app.delete('/api/bills/:id', wrap(async req => {
  const id = parseInt(req.params.id, 10);
  if (!id) throw new Error('Invalid bill ID');

  if (useFallback) {
    memDb.payment = memDb.payment.filter(p => p.bill_id !== id);
    memDb.bill = memDb.bill.filter(b => b.bill_id !== id);
    return { affected: 1, sql: `DELETE FROM bill WHERE bill_id = ${id};` };
  }

  await q('DELETE FROM payment WHERE bill_id = ?', [id]);
  const res = await q('DELETE FROM bill WHERE bill_id = ?', [id]);
  return { affected: res.affectedRows, sql: `DELETE FROM bill WHERE bill_id = ${id};` };
}));

// ================= PAYMENTS =================
app.get('/api/payments', wrap(async () => {
  if (useFallback) {
    return memDb.payment.map(p => {
      const b = memDb.bill.find(bill => bill.bill_id === p.bill_id) || {};
      return {
        payment_id: p.payment_id,
        bill_id: p.bill_id,
        order_id: b.order_id || '—',
        amount_paid: p.amount_paid,
        pay_method: p.pay_method,
        pay_time: p.pay_time,
        bill_total: b.total_amount || p.amount_paid,
        bill_status: b.bill_status || 'Paid'
      };
    }).reverse();
  }

  return q(`SELECT p.payment_id, p.bill_id, b.order_id, p.amount_paid, p.pay_method,
                   p.pay_time, b.total_amount AS bill_total, b.bill_status
            FROM payment p
            JOIN bill b ON b.bill_id = p.bill_id
            ORDER BY p.payment_id DESC`);
}));

app.post('/api/payments', wrap(async req => {
  const { bill_id, amount_paid, pay_method, pay_time } = req.body;
  if (!bill_id || amount_paid === undefined) throw new Error('Bill and Amount Paid are required');

  const bid = parseInt(bill_id, 10);
  const amt = parseFloat(amount_paid);
  const method = pay_method || 'UPI';
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const pTime = pay_time ? pay_time.replace('T', ' ') : now;

  if (useFallback) {
    const newPay = { payment_id: nextId.payment++, bill_id: bid, amount_paid: amt, pay_method: method, pay_time: pTime };
    memDb.payment.push(newPay);
    // Mark bill paid
    const bill = memDb.bill.find(b => b.bill_id === bid);
    if (bill) bill.bill_status = 'Paid';
    return {
      payment_id: newPay.payment_id,
      sql: `INSERT INTO payment (bill_id, amount_paid, pay_method, pay_time) VALUES (${bid}, ${amt}, '${method}', '${pTime}'); UPDATE bill SET bill_status='Paid' WHERE bill_id=${bid};`
    };
  }

  const sql = 'INSERT INTO payment (bill_id, amount_paid, pay_method, pay_time) VALUES (?, ?, ?, ?)';
  const params = [bid, amt, method, pTime];
  const [res] = await pool.query(sql, params);
  await pool.query("UPDATE bill SET bill_status = 'Paid' WHERE bill_id = ?", [bid]);

  return { payment_id: res.insertId, sql: formatSql(sql, params) + ` UPDATE bill SET bill_status='Paid' WHERE bill_id=${bid};` };
}));

app.delete('/api/payments/:id', wrap(async req => {
  const id = parseInt(req.params.id, 10);
  if (!id) throw new Error('Invalid payment ID');

  if (useFallback) {
    memDb.payment = memDb.payment.filter(p => p.payment_id !== id);
    return { affected: 1, sql: `DELETE FROM payment WHERE payment_id = ${id};` };
  }

  const res = await q('DELETE FROM payment WHERE payment_id = ?', [id]);
  return { affected: res.affectedRows, sql: `DELETE FROM payment WHERE payment_id = ${id};` };
}));

// ================= KITCHEN TICKETS =================
app.get('/api/kitchen-tickets', wrap(async () => {
  if (useFallback) {
    return memDb.kitchen_ticket.map(k => {
      const oi = memDb.order_item.find(o => o.order_item_id === k.order_item_id) || {};
      const m = memDb.menu_item.find(item => item.item_id === oi.item_id) || {};
      const order = memDb.orders.find(ord => ord.order_id === oi.order_id) || {};
      const table = memDb.dining_table.find(t => t.table_id === order.table_id) || {};
      return {
        ticket_id: k.ticket_id,
        order_item_id: k.order_item_id,
        order_id: oi.order_id || '—',
        table_no: table.table_no || '—',
        item_name: m.item_name || 'Custom Item',
        quantity: oi.quantity || 1,
        order_item: `${m.item_name || 'Item'} x${oi.quantity || 1}`,
        sent_time: k.sent_time,
        ready_time: k.ready_time,
        ticket_status: k.ticket_status
      };
    }).reverse();
  }

  return q(`SELECT k.ticket_id, k.order_item_id, oi.order_id, t.table_no, m.item_name, oi.quantity,
                   CONCAT(m.item_name, ' x', oi.quantity) AS order_item,
                   k.sent_time, k.ready_time, k.ticket_status
            FROM kitchen_ticket k
            JOIN order_item oi ON oi.order_item_id = k.order_item_id
            JOIN menu_item m ON m.item_id = oi.item_id
            JOIN orders o ON o.order_id = oi.order_id
            JOIN dining_table t ON t.table_id = o.table_id
            ORDER BY k.ticket_id DESC`);
}));

app.post('/api/kitchen-tickets', wrap(async req => {
  const { order_id, item_id, quantity, ticket_status } = req.body;
  if (!order_id || !item_id) throw new Error('Order and Menu Item are required');

  const oid = parseInt(order_id, 10);
  const mid = parseInt(item_id, 10);
  const qty = parseInt(quantity, 10) || 1;
  const status = ticket_status || 'Pending';
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  if (useFallback) {
    const item = memDb.menu_item.find(m => m.item_id === mid);
    const oiId = nextId.order_item++;
    memDb.order_item.push({
      order_item_id: oiId,
      order_id: oid,
      item_id: mid,
      quantity: qty,
      unit_price: item ? item.price : 100
    });
    const newTicket = {
      ticket_id: nextId.kitchen_ticket++,
      order_item_id: oiId,
      sent_time: now,
      ready_time: null,
      ticket_status: status
    };
    memDb.kitchen_ticket.push(newTicket);
    return {
      ticket_id: newTicket.ticket_id,
      sql: `INSERT INTO kitchen_ticket (order_item_id, sent_time, ticket_status) VALUES (${oiId}, '${now}', '${status}');`
    };
  }

  const [menu] = await pool.query('SELECT price FROM menu_item WHERE item_id = ?', [mid]);
  const unitPrice = menu.length ? menu[0].price : 0;

  const [oiRes] = await pool.query(
    'INSERT INTO order_item (order_id, item_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
    [oid, mid, qty, unitPrice]
  );

  const sql = 'INSERT INTO kitchen_ticket (order_item_id, sent_time, ticket_status) VALUES (?, ?, ?)';
  const params = [oiRes.insertId, now, status];
  const [res] = await pool.query(sql, params);

  return { ticket_id: res.insertId, sql: formatSql(sql, params) };
}));

app.delete('/api/kitchen-tickets/:id', wrap(async req => {
  const id = parseInt(req.params.id, 10);
  if (!id) throw new Error('Invalid ticket ID');

  if (useFallback) {
    memDb.kitchen_ticket = memDb.kitchen_ticket.filter(k => k.ticket_id !== id);
    return { affected: 1, sql: `DELETE FROM kitchen_ticket WHERE ticket_id = ${id};` };
  }

  const res = await q('DELETE FROM kitchen_ticket WHERE ticket_id = ?', [id]);
  return { affected: res.affectedRows, sql: `DELETE FROM kitchen_ticket WHERE ticket_id = ${id};` };
}));

// ================= WAITERS =================
app.get('/api/waiters', wrap(async () => {
  if (useFallback) return [...memDb.waiter];
  return q('SELECT * FROM waiter ORDER BY waiter_id DESC');
}));

app.post('/api/waiters', wrap(async req => {
  const { full_name, shift } = req.body;
  if (!full_name) throw new Error('Waiter Name is required');
  const sh = shift || 'Morning';

  if (useFallback) {
    const newWaiter = { waiter_id: nextId.waiter++, full_name, shift: sh };
    memDb.waiter.push(newWaiter);
    return {
      waiter_id: newWaiter.waiter_id,
      sql: `INSERT INTO waiter (full_name, shift) VALUES ('${full_name}', '${sh}');`
    };
  }

  const sql = 'INSERT INTO waiter (full_name, shift) VALUES (?, ?)';
  const params = [full_name, sh];
  const [res] = await pool.query(sql, params);
  return { waiter_id: res.insertId, sql: formatSql(sql, params) };
}));

app.delete('/api/waiters/:id', wrap(async req => {
  const id = parseInt(req.params.id, 10);
  if (!id) throw new Error('Invalid waiter ID');

  if (useFallback) {
    memDb.waiter = memDb.waiter.filter(w => w.waiter_id !== id);
    return { affected: 1, sql: `DELETE FROM waiter WHERE waiter_id = ${id};` };
  }

  // Update orders and discounts referencing this waiter or check
  await q('UPDATE orders SET waiter_id = 1 WHERE waiter_id = ?', [id]);
  await q('UPDATE discount SET authorized_by = NULL WHERE authorized_by = ?', [id]);
  const res = await q('DELETE FROM waiter WHERE waiter_id = ?', [id]);
  return { affected: res.affectedRows, sql: `DELETE FROM waiter WHERE waiter_id = ${id};` };
}));

// ================= DINING AREAS =================
app.get('/api/areas', wrap(async () => {
  if (useFallback) return [...memDb.dining_area];
  return q('SELECT * FROM dining_area ORDER BY area_id');
}));

app.post('/api/areas', wrap(async req => {
  const { area_name, floor_no } = req.body;
  if (!area_name) throw new Error('Area name is required');
  const floor = parseInt(floor_no, 10) || 1;

  if (useFallback) {
    const newArea = { area_id: nextId.dining_area++, area_name, floor_no: floor };
    memDb.dining_area.push(newArea);
    return { area_id: newArea.area_id, sql: `INSERT INTO dining_area (area_name, floor_no) VALUES ('${area_name}', ${floor});` };
  }

  const sql = 'INSERT INTO dining_area (area_name, floor_no) VALUES (?, ?)';
  const params = [area_name, floor];
  const [res] = await pool.query(sql, params);
  return { area_id: res.insertId, sql: formatSql(sql, params) };
}));

app.delete('/api/areas/:id', wrap(async req => {
  const id = parseInt(req.params.id, 10);
  if (!id) throw new Error('Invalid area ID');

  if (useFallback) {
    memDb.dining_area = memDb.dining_area.filter(a => a.area_id !== id);
    return { affected: 1, sql: `DELETE FROM dining_area WHERE area_id = ${id};` };
  }

  // Reassign tables or delete
  await q('UPDATE dining_table SET area_id = 1 WHERE area_id = ?', [id]);
  const res = await q('DELETE FROM dining_area WHERE area_id = ?', [id]);
  return { affected: res.affectedRows, sql: `DELETE FROM dining_area WHERE area_id = ${id};` };
}));

// Start server
const PORT = process.env.PORT || 3000;
initDb().finally(() => {
  app.listen(PORT, () => {
    console.log(`Restaurant Management running: http://localhost:${PORT}`);
  });
});
