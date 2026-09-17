import { Hono } from 'hono';
import { listCalendar } from '../handlers/calendar/list';

export const calendarRouter = new Hono();

calendarRouter.get('/', listCalendar);
