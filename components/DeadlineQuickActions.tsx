import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Calendar as CalendarIcon, Calculator } from "lucide-react";
import { Button } from "./Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "./Dialog";
import { useCreateDeadline } from "../helpers/deadlineManagementQueries";
import { calculateDeadline } from "../helpers/deadlineClientCalculator"; // Client-side calc for preview
import styles from "./DeadlineQuickActions.module.css";

// Schema for the form
const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  deadline: z.string().min(1, "Date is required"), // Input type="date" returns string
  obligationInstanceId: z.string().optional(), // Optional linkage
});

type FormData = z.infer<typeof formSchema>;

export const DeadlineQuickActions: React.FC = () => {
  const [open, setOpen] = useState(false);
  const createMutation = useCreateDeadline();
  
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      deadline: new Date().toISOString().split('T')[0]
    }
  });

  const onSubmit = (data: FormData) => {
    createMutation.mutate({
      title: data.title,
      description: data.description,
      deadline: new Date(data.deadline),
      eventType: "MANUAL_ENTRY",
      obligationInstanceId: data.obligationInstanceId ? parseInt(data.obligationInstanceId) : undefined,
    }, {
      onSuccess: () => {
        setOpen(false);
        reset();
      }
    });
  };

  const handleAutoCalculate = () => {
    // Simple client-side helper to set date to 30 days from now for quick entry
    // In a real scenario, this might fetch the obligation date, but here we simulate "30 days from today"
    // as a quick default for manual entries.
    const { deadline } = calculateDeadline(new Date(), false);
    setValue("deadline", deadline.toISOString().split('T')[0]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={styles.triggerButton}>
          <Plus size={16} />
          Create Deadline
        </Button>
      </DialogTrigger>
      <DialogContent className={styles.dialogContent}>
        <DialogHeader>
          <DialogTitle>Create New Deadline</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="title">Title</label>
            <input 
              id="title" 
              {...register("title")} 
              className={styles.input} 
              placeholder="e.g., Response Due for Packet #123"
            />
            {errors.title && <span className={styles.error}>{errors.title.message}</span>}
          </div>

          <div className={styles.field}>
            <label htmlFor="deadline">Deadline Date</label>
            <div className={styles.dateInputWrapper}>
              <input 
                id="deadline" 
                type="date" 
                {...register("deadline")} 
                className={styles.input} 
              />
              <Button 
                type="button" 
                variant="secondary" 
                size="icon-md" 
                onClick={handleAutoCalculate}
                title="Set to 30 days from now (CA Policy)"
              >
                <Calculator size={16} />
              </Button>
            </div>
            {errors.deadline && <span className={styles.error}>{errors.deadline.message}</span>}
          </div>

          <div className={styles.field}>
            <label htmlFor="obligationId">Obligation ID (Optional)</label>
            <input 
              id="obligationId" 
              type="number" 
              {...register("obligationInstanceId")} 
              className={styles.input} 
              placeholder="Link to obligation..."
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="description">Description</label>
            <textarea 
              id="description" 
              {...register("description")} 
              className={styles.textarea} 
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Deadline"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};