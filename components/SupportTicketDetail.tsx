import { useRef, useState } from 'react';
import { z } from 'zod';
import { useSupportTicket, useUpdateSupportTicket, useReplySupportTicket } from '../helpers/supportTicketQueries';
import { useSupportAgents } from '../helpers/useSupportAgents';
import { useAuth } from '../helpers/useAuth';
import { Badge } from './Badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './Select';
import { Button } from './Button';
import { Textarea } from './Textarea';
import { Form, FormItem, FormControl, FormMessage, useForm } from './Form';
import { Skeleton } from './Skeleton';
import { Spinner } from './Spinner';
import { useToast } from '../helpers/useToast';
import { format, formatDistanceToNow } from '../helpers/dateUtils';
import { Lock, User, Headset, Send } from 'lucide-react';
import { getStatusBadgeVariant, getPriorityBadgeVariant, formatEnum } from './SupportTicketList';
import { SupportTicketStatus, SupportTicketPriority } from '../helpers/schema';
import styles from './SupportTicketDetail.module.css';

const replySchema = z.object({
  message: z.string().min(1, 'Message is required'),
  isInternalNote: z.boolean().optional()
});

export const SupportTicketDetail = ({ ticketId }: { ticketId: number }) => {
  const { authState } = useAuth();
  const currentUserRole = authState.type === 'authenticated' ? authState.user.role : 'user';
  const isStaff = currentUserRole === 'admin' || currentUserRole === 'support';

  const { data, isPending, refetch } = useSupportTicket(ticketId);
  const { mutate: updateTicket } = useUpdateSupportTicket();
  const { mutate: replyTicket, isPending: isReplying } = useReplySupportTicket();

  const { data: agentsData } = useSupportAgents();
  const agents = agentsData?.agents || [];

  const { showSuccess, showError } = useToast();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [resolutionNote, setResolutionNote] = useState('');

  const form = useForm({
    defaultValues: { message: '', isInternalNote: false },
    schema: replySchema
  });

  const onSubmitReply = (values: z.infer<typeof replySchema>) => {
    replyTicket({ ticketId, message: values.message, isInternalNote: values.isInternalNote }, {
      onSuccess: () => {
        showSuccess('Reply sent');
        form.setValues({ message: '', isInternalNote: false });
        refetch();
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      },
      onError: (err) => {
        showError(err instanceof Error ? err.message : 'Failed to send reply');
      }
    });
  };

  const handleStatusChange = (status: SupportTicketStatus) => {
    const statusNeedsResolutionNote = status === 'RESOLVED' || status === 'CLOSED';
    const trimmedResolutionNote = resolutionNote.trim();

    if (statusNeedsResolutionNote && trimmedResolutionNote.length < 5) {
      showError('Add a resolution note (min 5 characters) before resolving or closing this ticket.');
      return;
    }

    updateTicket(
      {
        ticketId,
        status,
        resolutionNote: statusNeedsResolutionNote ? trimmedResolutionNote : undefined,
      },
      {
        onSuccess: () => {
          showSuccess('Status updated');
          if (statusNeedsResolutionNote) {
            setResolutionNote('');
          }
          refetch();
        },
        onError: (err) => showError(err instanceof Error ? err.message : 'Failed to update status')
      }
    );
  };

  const handlePriorityChange = (priority: SupportTicketPriority) => {
    updateTicket({ ticketId, priority }, {
      onSuccess: () => { showSuccess('Priority updated'); refetch(); },
      onError: (err) => showError(err instanceof Error ? err.message : 'Failed to update priority')
    });
  };

  const handleAgentChange = (val: string) => {
    const assignedAgentId = val === '__empty' ? null : Number(val);
    updateTicket({ ticketId, assignedAgentId }, {
      onSuccess: () => { showSuccess('Agent assigned'); refetch(); },
      onError: (err) => showError(err instanceof Error ? err.message : 'Failed to assign agent')
    });
  };

  if (isPending || !data) {
    return (
      <div className={styles.loadingContainer}>
        <Skeleton className={styles.headerSkeleton} />
        <Skeleton className={styles.bodySkeleton} />
      </div>
    );
  }

  const { ticket, messages, userDisplayName } = data;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.subject}>{ticket.subject}</h1>
          <div className={styles.badges}>
            <Badge variant={getStatusBadgeVariant(ticket.status)}>{formatEnum(ticket.status)}</Badge>
            <Badge variant={getPriorityBadgeVariant(ticket.priority)}>{formatEnum(ticket.priority)}</Badge>
          </div>
        </div>
        <div className={styles.metaRow}>
          <span className={styles.metaItem}>
            <span className={styles.metaLabel}>Category:</span> {formatEnum(ticket.category)}
          </span>
          <span className={styles.metaDivider}>|</span>
          <span className={styles.metaItem}>
            <span className={styles.metaLabel}>Created:</span> {format(ticket.createdAt, 'MMM d, yyyy')}
          </span>
          <span className={styles.metaDivider}>|</span>
          <span className={styles.metaItem}>
            <span className={styles.metaLabel}>User:</span> {userDisplayName}
          </span>
        </div>
      </div>

      {isStaff && (
        <div className={styles.adminControls}>
          <div className={styles.controlGroup}>
            <label className={styles.controlLabel}>Status</label>
            <Select value={ticket.status} onValueChange={(v) => handleStatusChange(v as SupportTicketStatus)}>
              <SelectTrigger className={styles.controlSelect}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="WAITING_ON_USER">Waiting on User</SelectItem>
                <SelectItem value="RESOLVED">Resolved</SelectItem>
                <SelectItem value="CLOSED">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className={styles.controlGroup}>
            <label className={styles.controlLabel}>Priority</label>
            <Select value={ticket.priority} onValueChange={(v) => handlePriorityChange(v as SupportTicketPriority)}>
              <SelectTrigger className={styles.controlSelect}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="URGENT">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className={styles.controlGroup}>
            <label className={styles.controlLabel}>Assign To</label>
            <Select value={ticket.assignedAgentId ? String(ticket.assignedAgentId) : '__empty'} onValueChange={handleAgentChange}>
              <SelectTrigger className={styles.controlSelect}><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__empty">Unassigned</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className={styles.controlGroupWide}>
            <label className={styles.controlLabel}>Resolution Note</label>
            <Textarea
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              rows={3}
              placeholder="Required before setting status to Resolved or Closed"
              className={styles.resolutionTextarea}
            />
          </div>
        </div>
      )}

      <div className={styles.ticketBody}>
        <div className={styles.descriptionBlock}>
          <div className={styles.messageHeader}>
            <User size={14} />
            <span className={styles.messageAuthor}>{userDisplayName}</span>
            <span className={styles.messageTime}>{formatDistanceToNow(ticket.createdAt, { addSuffix: true })}</span>
          </div>
          <div className={styles.descriptionContent}>{ticket.description}</div>
        </div>

        <div className={styles.messageList}>
          {messages.map((msg) => {
            const isUser = msg.senderRole === 'user';
            const isInternal = msg.isInternalNote;

            return (
              <div
                key={msg.id}
                className={`
                  ${styles.messageWrapper}
                  ${isUser ? styles.user : styles.agent}
                  ${isInternal ? styles.internal : ''}
                `}
              >
                <div className={styles.messageHeader}>
                  {isInternal ? <Lock size={12} className={styles.lockIcon} /> : (isUser ? <User size={12} /> : <Headset size={12} />)}
                  <span className={styles.messageAuthor}>{msg.senderDisplayName}</span>
                  {isInternal && <span className={styles.internalBadge}>Staff Only</span>}
                  <span className={styles.messageTime}>{formatDistanceToNow(msg.createdAt, { addSuffix: true })}</span>
                </div>
                <div className={styles.messageBox}>
                  {msg.message}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {ticket.status === 'CLOSED' ? (
        <div className={styles.closedNotice}>
          This ticket is closed. No further replies can be sent.
        </div>
      ) : (
        <div className={styles.replySection}>
          <h3 className={styles.replyHeading}>Reply</h3>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitReply)} className={styles.replyForm}>
              <FormItem name="message" className={styles.replyItem}>
                <FormControl>
                  <Textarea
                    placeholder="Type your reply here..."
                    value={form.values.message}
                    onChange={(e) => form.setValues((prev) => ({ ...prev, message: e.target.value }))}
                    rows={4}
                    className={styles.replyTextarea}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>

              <div className={styles.replyActions}>
                {isStaff && (
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={form.values.isInternalNote}
                      onChange={(e) => form.setValues((prev) => ({ ...prev, isInternalNote: e.target.checked }))}
                      className={styles.checkbox}
                    />
                    <span>Internal Note (Staff only)</span>
                  </label>
                )}

                <Button type="submit" disabled={isReplying} className={styles.sendButton}>
                  {isReplying ? <Spinner size="sm" /> : <><Send size={16} /> Send Reply</>}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      )}
    </div>
  );
};
