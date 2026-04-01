import { FastifyRequest, FastifyReply } from 'fastify';

export function authorize(...allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { role } = request.user;
    if (!allowedRoles.includes(role)) {
      reply.status(403).send({
        error: 'FORBIDDEN',
        message: `Action Restricted: Requires ${allowedRoles.join(' or ')} Role`,
      });
    }
  };
}
