# BARBER HUB — Инструкция по запуску

## Что внутри
- `src/App.jsx` — весь код приложения
- `src/firebase.js` — подключение к Firebase (уже настроено)
- `src/main.jsx` — точка входа React
- `public/manifest.json` — PWA манифест (установка на телефон)
- `firestore.rules` — правила безопасности базы данных

---

## Шаг 1 — Настройка Firebase

### 1.1 Firestore правила безопасности
1. Открой [Firebase Console](https://console.firebase.google.com)
2. Выбери проект **barber-hub-6c69d**
3. Слева → **Firestore Database** → вкладка **Rules**
4. Скопируй содержимое файла `firestore.rules` и вставь туда
5. Нажми **Publish**

### 1.2 Создай аккаунт владельца
Владелец входит через специальный email/пароль прямо в коде:
- Email: `owner@barberhub.com`
- Пароль: `owner2024`

Это не Firebase Auth — это локальная проверка. Для продакшна смени пароль в файле `src/App.jsx` в строке:
```js
const OWNER = { name:"Владелец", email:"owner@barberhub.com", password:"owner2024", role:"owner" };
```

### 1.3 Добавь первых мастеров
После запуска зайди как **владелец** → Панель владельца → Мастера → "+ Добавить мастера".
Мастер получит аккаунт в Firebase Auth автоматически.

---

## Шаг 2 — Запуск локально

### Требования
- Node.js 18+ (скачать на nodejs.org)
- npm (идёт вместе с Node.js)

### Установка и запуск
```bash
# Распакуй архив и зайди в папку
cd barberhub-app

# Установи зависимости (один раз)
npm install

# Запусти сервер разработки
npm run dev
```

Открой браузер: **http://localhost:5173**

---

## Шаг 3 — Публикация сайта (Vercel)

1. Зарегистрируйся на [vercel.com](https://vercel.com) через GitHub
2. Загрузи папку `barberhub-app` на GitHub
3. В Vercel нажми "Add New Project" → выбери репозиторий
4. Настройки оставь по умолчанию → Deploy
5. Твой сайт будет доступен по адресу `barberhub-xxx.vercel.app`

---

## Шаг 4 — Установка как приложение на телефон (PWA)

### Android (Chrome)
1. Открой сайт в Chrome
2. Нажми меню ⋮ → "Добавить на главный экран"
3. Нажми "Добавить" → иконка появится как у приложения

### iPhone (Safari)
1. Открой сайт в Safari
2. Нажми кнопку "Поделиться" (квадрат со стрелкой)
3. Прокрути вниз → "На экран «Домой»"
4. Нажми "Добавить"

---

## Структура данных в Firestore

| Коллекция | Что хранит |
|-----------|-----------|
| `users` | Клиенты (name, email, phone, role, sub) |
| `masters` | Мастера (профиль, услуги, расписание) |
| `bookings` | Записи клиентов |
| `reviews` | Отзывы |
| `blocks` | Блоки времени мастеров |
| `config/subs` | Тарифы подписок |
| `config/salonSchedule` | Расписание салона |
| `notifications` | Уведомления |

---

## Следующие шаги (позже)

- **Онлайн оплата** — подключить Paysera или Stripe
- **Push-уведомления** — Firebase Cloud Messaging
- **Нативное приложение** — Expo/React Native для App Store и Google Play
