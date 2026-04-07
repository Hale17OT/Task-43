import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authorize } from '../plugins/authorize.plugin.js';

const subscriptionSchema = z.object({
  reportType: z.string().min(1),
  filters: z.record(z.unknown()).optional(),
});

const updateSubscriptionSchema = z.object({
  isActive: z.boolean().optional(),
  filters: z.record(z.unknown()).optional(),
}).strict();

export default async function reportRoutes(app: FastifyInstance) {
  // GET /api/reports/dashboard
  app.get('/api/reports/dashboard', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest) => {
    const db = request.db;

    const query = request.query as Record<string, string>;
    const { orgId, role } = request.user;

    // For super_admin: no orgId param means aggregate across all orgs
    const targetOrgId = role === 'super_admin'
      ? (query.orgId || null)
      : orgId;
    const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = query.to ? new Date(query.to) : new Date();

    let bookingQuery = db('bookings')
      .where('created_at', '>=', from)
      .where('created_at', '<=', to);
    if (targetOrgId) bookingQuery = bookingQuery.where('org_id', targetOrgId);

    if (query.role) {
      let userFilter = db('users').select('id').where({ role: query.role });
      if (targetOrgId) userFilter = userFilter.where({ org_id: targetOrgId });
      if (query.role === 'client') {
        bookingQuery = bookingQuery.whereIn('client_id', userFilter);
      } else if (query.role === 'lawyer') {
        bookingQuery = bookingQuery.whereIn('lawyer_id', userFilter);
      }
    }

    const totalBookings = await bookingQuery.clone().count('id as count').first();
    const completedBookings = await bookingQuery.clone().where({ status: 'completed' }).count('id as count').first();
    const noShows = await bookingQuery.clone().where({ status: 'no_show' }).count('id as count').first();
    const cancellations = await bookingQuery.clone().where({ status: 'cancelled' }).count('id as count').first();

    const totalCount = Number(totalBookings?.count ?? 0);
    const completedCount = Number(completedBookings?.count ?? 0);
    const noShowCount = Number(noShows?.count ?? 0);
    const cancellationCount = Number(cancellations?.count ?? 0);

    // Availability: count of active availability slots vs booked
    let slotsQuery = db('availability').where({ is_active: true });
    if (targetOrgId) {
      slotsQuery = slotsQuery.whereIn('lawyer_id', db('users').select('id').where({ org_id: targetOrgId, role: 'lawyer' }));
    }
    const totalSlots = await slotsQuery.count('id as count').first();
    const totalSlotsCount = Number(totalSlots?.count ?? 1);

    // Alerts / incidents (disputes)
    let disputeUserFilter = db('users').select('id');
    if (targetOrgId) disputeUserFilter = disputeUserFilter.where({ org_id: targetOrgId });

    const totalDisputes = await db('disputes')
      .whereIn('appellant_id', disputeUserFilter)
      .where('filed_at', '>=', from).where('filed_at', '<=', to)
      .count('id as count').first();
    const resolvedDisputes = await db('disputes')
      .whereIn('appellant_id', disputeUserFilter)
      .where('filed_at', '>=', from).where('filed_at', '<=', to)
      .whereIn('status', ['resolved', 'dismissed'])
      .count('id as count').first();

    const disputeTotal = Number(totalDisputes?.count ?? 0);
    const disputeResolved = Number(resolvedDisputes?.count ?? 0);

    return {
      availability: totalSlotsCount > 0 ? Math.round(((totalSlotsCount - completedCount) / totalSlotsCount) * 100) : 0,
      faultRate: totalCount > 0 ? Math.round(((noShowCount + cancellationCount) / totalCount) * 100) : 0,
      utilization: totalSlotsCount > 0 ? Math.round((completedCount / totalSlotsCount) * 100) : 0,
      throughput: completedCount,
      closedLoopEfficiency: disputeTotal > 0 ? Math.round((disputeResolved / disputeTotal) * 100) : 100,
      period: { from: from.toISOString(), to: to.toISOString() },
    };
  });

  // GET /api/reports/export
  app.get('/api/reports/export', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    const format = query.format ?? 'csv';
    const db = request.db;

    const { orgId, role } = request.user;
    const targetOrgId = role === 'super_admin' ? (query.orgId || null) : orgId;

    let exportQuery = db('bookings');
    if (targetOrgId) exportQuery = exportQuery.where('org_id', targetOrgId);
    if (query.from) exportQuery = exportQuery.where('created_at', '>=', new Date(query.from));
    if (query.to) exportQuery = exportQuery.where('created_at', '<=', new Date(query.to));
    if (query.role && targetOrgId) {
      const userFilter = db('users').select('id').where({ role: query.role, org_id: targetOrgId });
      if (query.role === 'client') {
        exportQuery = exportQuery.whereIn('client_id', userFilter);
      } else if (query.role === 'lawyer') {
        exportQuery = exportQuery.whereIn('lawyer_id', userFilter);
      }
    }
    const bookings = await exportQuery
      .orderBy('created_at', 'desc')
      .limit(1000);

    if (format === 'csv') {
      const { Parser } = await import('json2csv');
      const fields = ['id', 'client_id', 'lawyer_id', 'type', 'status', 'scheduled_at', 'created_at'];
      const parser = new Parser({ fields });
      const csv = parser.parse(bookings);

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="report.csv"');
      return reply.send(csv);
    } else {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.default.Workbook();
      const sheet = workbook.addWorksheet('Bookings');
      sheet.columns = [
        { header: 'ID', key: 'id', width: 40 },
        { header: 'Client', key: 'client_id', width: 40 },
        { header: 'Lawyer', key: 'lawyer_id', width: 40 },
        { header: 'Type', key: 'type', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Scheduled', key: 'scheduled_at', width: 25 },
        { header: 'Created', key: 'created_at', width: 25 },
      ];
      bookings.forEach((b: any) => sheet.addRow(b));

      const buffer = await workbook.xlsx.writeBuffer();
      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      reply.header('Content-Disposition', 'attachment; filename="report.xlsx"');
      return reply.send(Buffer.from(buffer as ArrayBuffer));
    }
  });

  // CRUD /api/report-subscriptions
  app.get('/api/report-subscriptions', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest) => {
    const db = request.db;

    const rows = await db('report_subscriptions').where({ user_id: request.user.userId }).orderBy('created_at', 'desc');
    return { data: rows };
  });

  app.post('/api/report-subscriptions', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = subscriptionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues });
    }

    const db = request.db;

    const [sub] = await db('report_subscriptions').insert({
      user_id: request.user.userId,
      report_type: parsed.data.reportType,
      filters: parsed.data.filters ?? {},
    }).returning('*');

    return reply.status(201).send({ subscription: sub });
  });

  app.patch('/api/report-subscriptions/:id', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = updateSubscriptionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues });
    }

    const body = parsed.data;
    const db = request.db;

    const [sub] = await db('report_subscriptions')
      .where({ id, user_id: request.user.userId })
      .update({
        is_active: body.isActive,
        filters: body.filters ?? undefined,
      })
      .returning('*');

    if (!sub) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Subscription not found' });
    }
    return { subscription: sub };
  });

  app.delete('/api/report-subscriptions/:id', {
    preHandler: [app.authenticate, authorize('admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const db = request.db;

    const count = await db('report_subscriptions').where({ id, user_id: request.user.userId }).del();
    if (count === 0) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Subscription not found' });
    }
    return reply.status(204).send();
  });
}
