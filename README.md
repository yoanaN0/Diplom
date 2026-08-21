# Finly

Finly е финансово приложение за управление на разходи, приходи, цели, бюджети и портфейли. Проектът включва PHP API с MySQL база данни и React/Vite клиент за frontend.

## Основни функции

- Регистрация и логин на потребител
- Управление на транзакции
- Проследяване на разходи и приходи
- Бюджети по категории
- Цели/финансови намерения
- Управление на портфейли
- Dashboard с аналитика
- "Financial Twin" модул за финансово планиране
- Настройки на профила

## Технологии

- Frontend: React + Vite
- Backend: PHP
- База данни: MySQL / MariaDB
- API: PHP endpoints в папката `api`
- Стили: CSS / React components

## Структура на проекта

```text
DiplomJSme/
├── api/                     # PHP API
│   ├── auth/                # Логин/регистрация/профил
│   ├── lib/                 # Helper файлове
│   ├── config.php           # Конфигурация за база данни
│   ├── bootstrap.php
│   ├── budgets.php
│   ├── categories.php
│   ├── goals.php
│   ├── transactions.php
│   ├── wallets.php
│   └── profile.php
├── client/                  # React frontend
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── vite.config.js
│   └── .env.example
├── database/
│   └── finly_schema.sql     # SQL схема на база данни
├── WAMP_SETUP.md            # Подробна WAMP конфигурация
├── package.json             # Root-level setup info
├── README.md                # Това README
└── ...
```

## Изисквания

- WAMP/XAMPP с PHP и MySQL
- Node.js 18+
- npm
- Достъп до http://localhost/phpmyadmin

## Настройка на базата данни

1. Поставете проекта в `C:/wamp64/www/DiplomJSme`
2. Отворете http://localhost/phpmyadmin
3. Импортирайте файла:
   - `database/finly_schema.sql`
4. Това създава база данни `finly`

## Конфигурация на API

Файлът `api/config.php` по default очаква:

- host: `127.0.0.1`
- port: `3306`
- db: `finly`
- user: `root`
- pass: `""` (празна)

Ако вашите WAMP данни са различни, актуализирайте `api/config.php` или задайте environment променливи:

```bash
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=finly
DB_USER=root
DB_PASS=
FRONTEND_ORIGIN=http://localhost:5173
```

## Настройка на frontend

В папката `client`:

```bash
npm install
```

Създайте `.env` файл въз основа на `.env.example`:

```env
VITE_API_BASE_URL=http://localhost/DiplomJSme/api
```

## Стартиране

### 1. Започнете WAMP

Уверете се, че Apache и MySQL работят.

### 2. Стартирайте frontend

```bash
cd client
npm run dev
```

След това приложението обикновено е достъпно на:

- Frontend: http://localhost:5173
- API: http://localhost/DiplomJSme/api

## Основни API endpoint-и

- `POST /api/auth/register.php`
- `POST /api/auth/login.php`
- `GET /api/auth/me.php`
- `POST /api/auth/logout.php`
- `GET /api/transactions.php`
- `GET /api/wallets.php`
- `GET /api/budgets.php`
- `GET /api/goals.php`
- `GET /api/categories.php`

## Полезни команди

```bash
cd client
npm run dev      # стартира Vite dev сървър
npm run build    # build за production
npm run lint     # проверка на ESLint
```

## Бележки

- За да работи приложението коректно, API и MySQL трябва да са стартирани в WAMP.
- Ако имате различна база или порт, коригирайте конфигурацията в `api/config.php`.
- Допълнителна информация за WAMP настройката може да се намери в [WAMP_SETUP.md](WAMP_SETUP.md).

## Автор

Този проект е разработен като дипломен проект за финансов мениджмънт приложение.
