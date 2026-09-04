# WAMP + phpMyAdmin Setup (Finly Auth)

## 1) Copy project to WAMP www
Place the project so that API is available at:
- http://localhost/DiplomJSme/api

If needed, copy this folder to:
- C:/wamp64/www/DiplomJSme

## 2) Create database in phpMyAdmin
1. Open http://localhost/phpmyadmin
2. Import file:
- database/finly_schema.sql

This creates database `finly` and table `users`.

## 3) API configuration
Default config in `api/config.php` expects:
- host: 127.0.0.1
- port: 3306
- db: finly
- user: root
- pass: (empty)

If your WAMP credentials differ, update `api/config.php` or set environment variables:
- DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS
- FRONTEND_ORIGIN (default: http://localhost:5173)

## 4) Frontend env
In `client`, create `.env` from `.env.example`:
- VITE_API_BASE_URL=http://localhost/DiplomJSme/api

## 5) Run frontend
In `client`:
- npm install
- npm run dev

## 6) Auth endpoints
- POST /api/auth/register.php
- POST /api/auth/login.php
- GET /api/auth/me.php
- POST /api/auth/logout.php

Requests and responses are JSON. Session is cookie-based.

## 7) Real email delivery for verification codes
By default, local WAMP usually cannot send external email via PHP mail().

Use SMTP transport with environment variables (recommended):

- MAIL_TRANSPORT=smtp
- SMTP_HOST=smtp.gmail.com
- SMTP_PORT=587
- SMTP_ENCRYPTION=tls
- SMTP_USERNAME=your-account@gmail.com
- SMTP_PASSWORD=your-app-password
- MAIL_FROM_ADDRESS=your-account@gmail.com
- MAIL_FROM_NAME=Finly

Notes:
- For Gmail, use an App Password (not your normal account password).
- Restart Apache after updating environment variables.
- If SMTP is not configured or fails, verification codes are written to:
	api/tmp/email_verification_outbox.log
