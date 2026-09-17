import { Hono } from 'hono';
import { getRates } from '../handlers/exchange-rates/rates';

export const exchangeRatesRouter = new Hono();

exchangeRatesRouter.get('/', getRates);
