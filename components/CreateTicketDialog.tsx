import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './Dialog';
import { Form, FormItem, FormLabel, FormControl, FormMessage, useForm } from './Form';
import { Input } from './Input';
import { Textarea } from './Textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './Select';
import { Button } from './Button';
import { z } from 'zod';
import { useCreateSupportTicket } from '../helpers/supportTicketQueries';
import { useToast } from '../helpers/useToast';
import styles from './CreateTicketDialog.module.css';

const schema = z.object({
  subject: z.string().min(1, "Subject is required"),
  category: z.enum(["ACCOUNT", "BILLING", "DISPUTE_HELP", "TECHNICAL", "OTHER"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  description: z.string().min(1, "Description is required"),
});

export const CreateTicketDialog = ({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) => {
  const form = useForm({
    defaultValues: {
      subject: '',
      category: 'OTHER',
      priority: 'MEDIUM',
      description: ''
    },
    schema
  });

  const { mutate: createTicket, isPending } = useCreateSupportTicket();
  const { showSuccess, showError } = useToast();

  const onSubmit = (values: z.infer<typeof schema>) => {
    createTicket(values, {
      onSuccess: () => {
        showSuccess("Ticket created successfully");
        onOpenChange(false);
        form.setValues({
          subject: '',
          category: 'OTHER',
          priority: 'MEDIUM',
          description: ''
        });
      },
      onError: (err) => {
        showError(err instanceof Error ? err.message : "Failed to create ticket");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Support Ticket</DialogTitle>
          <DialogDescription>Please describe your issue below.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className={styles.form}>
            <FormItem name="subject">
              <FormLabel>Subject</FormLabel>
              <FormControl>
                <Input value={form.values.subject} onChange={e => form.setValues(p => ({...p, subject: e.target.value}))} placeholder="Brief summary of your issue" />
              </FormControl>
              <FormMessage />
            </FormItem>

            <div className={styles.row}>
              <FormItem name="category" className={styles.flexItem}>
                <FormLabel>Category</FormLabel>
                <Select value={form.values.category} onValueChange={v => form.setValues(p => ({...p, category: v as any}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACCOUNT">Account</SelectItem>
                    <SelectItem value="BILLING">Billing</SelectItem>
                    <SelectItem value="DISPUTE_HELP">Dispute Help</SelectItem>
                    <SelectItem value="TECHNICAL">Technical</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>

              <FormItem name="priority" className={styles.flexItem}>
                <FormLabel>Priority</FormLabel>
                <Select value={form.values.priority} onValueChange={v => form.setValues(p => ({...p, priority: v as any}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            </div>

            <FormItem name="description">
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea value={form.values.description} onChange={e => form.setValues(p => ({...p, description: e.target.value}))} placeholder="Detailed description..." rows={5} />
              </FormControl>
              <FormMessage />
            </FormItem>

            <div className={styles.actions}>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? 'Submitting...' : 'Submit Ticket'}</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};