import { z } from "zod";
import { Button } from "./Button";
import { Input } from "./Input";
import { Textarea } from "./Textarea";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "./Dialog";
import { 
  Form, 
  FormItem, 
  FormLabel, 
  FormControl, 
  FormMessage,
  useForm
} from "./Form";
import { useCreateEvidenceEvent } from "../helpers/evidenceQueries";
import { useToast } from "../helpers/useToast";
import styles from "./EvidenceEventCreateDialog.module.css";

const createEventSchema = z.object({
  eventType: z.string().min(1, "Event type is required"),
  description: z.string().min(1, "Description is required"),
  packetId: z.number().nullable().optional(),
  statuteId: z.number().nullable().optional(),
});

type CreateEventFormValues = z.infer<typeof createEventSchema>;

export const EvidenceEventCreateDialog = ({ 
  open, 
  onOpenChange 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void 
}) => {
  const { mutate: createEvent, isPending } = useCreateEvidenceEvent();
  const { showSuccess, showError } = useToast();
  
  const form = useForm({
    schema: createEventSchema,
    defaultValues: {
      eventType: "",
      description: "",
      packetId: null,
      statuteId: null,
    },
  });

  const onSubmit = (values: CreateEventFormValues) => {
    createEvent(
      {
        eventType: values.eventType,
        description: values.description,
        packetId: values.packetId ?? undefined,
        // Mapping statuteId from form to statuteVersionId expected by the API
        statuteVersionId: values.statuteId ?? undefined,
      },
      {
        onSuccess: () => {
          showSuccess("Communication created");
          onOpenChange(false);
          form.setValues({
            eventType: "",
            description: "",
            packetId: null,
            statuteId: null,
          });
        },
        onError: (err) => {
          console.error("Failed to create evidence event", err);
          showError("Failed to create communication");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Communication</DialogTitle>
          <DialogDescription>
            Record a new communication manually. Region will be set to CA.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className={styles.form}>
            <div className={styles.formRow}>
              <FormItem name="eventType" className={styles.flex1}>
                <FormLabel>Event Type</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="e.g. PACKET_CREATED" 
                    value={form.values.eventType}
                    onChange={(e) => form.setValues(prev => ({ ...prev, eventType: e.target.value }))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>

              <FormItem name="packetId" className={styles.flex1}>
                <FormLabel>Packet ID (Optional)</FormLabel>
                <FormControl>
                  <Input 
                    type="number"
                    placeholder="Packet ID" 
                    value={form.values.packetId ?? ""}
                    onChange={(e) => {
                      const val = e.target.value === "" ? null : parseInt(e.target.value, 10);
                      form.setValues(prev => ({ ...prev, packetId: val }));
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            </div>

            <FormItem name="description">
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Describe the event..." 
                  value={form.values.description}
                  onChange={(e) => form.setValues(prev => ({ ...prev, description: e.target.value }))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>

            <div className={styles.formRow}>
              <FormItem name="statuteId" className={styles.flex1}>
                <FormLabel>Statute ID (Optional)</FormLabel>
                <FormControl>
                  <Input 
                    type="number"
                    placeholder="Statute ID" 
                    value={form.values.statuteId ?? ""}
                    onChange={(e) => {
                      const val = e.target.value === "" ? null : parseInt(e.target.value, 10);
                      form.setValues(prev => ({ ...prev, statuteId: val }));
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} type="button">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save Communication"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
