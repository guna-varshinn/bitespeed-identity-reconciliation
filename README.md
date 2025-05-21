# Bitespeed Identity Reconciliation

## Overview
A backend service to reconcile customer identities based on email and phone number.

## Deployment
1. **Railway**: [![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/your-repo)
2. **Render**: [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

## Endpoint
- `POST /identify`
  - Request Body: `{ "email"?: string, "phoneNumber"?: number }`
  - Response: Consolidated contact details.

## Environment Variables
- `DATABASE_URL`: PostgreSQL connection string.
- `PORT`: Server port (default: 3000).

## Local Development
1. Clone the repo.
2. Run `npm install`.
3. Set up `.env` file.
4. Run `npm run dev`.