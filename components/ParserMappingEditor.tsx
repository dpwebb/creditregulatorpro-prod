import { useEffect, useState } from "react";
import { z } from "zod";
import { Selectable } from "kysely";
import { ParserFieldMapping } from "../helpers/schema";
import {
  useCreateParserMapping,
  useUpdateParserMapping,
} from "../helpers/parserMappingQueries";
import { useToast } from "../helpers/useToast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "./Sheet";
import { Button } from "./Button";
import { Input } from "./Input";
import { Textarea } from "./Textarea";
import { Switch } from "./Switch";
import {
  Form,
  useForm,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from "./Form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./Select";
import styles from "./ParserMappingEditor.module.css";

const TRANSFORM_TYPES = [
  "direct",
  "date_parse",
  "numeric",
  "regex_extract",
  "uppercase",
  "lowercase",
  "boolean",
  "fallback_chain",
];

const SECTIONS = [
  "tradeline",
  "consumer_info",
  "inquiry",
  "public_record",
  "employment",
  "metadata",
];

const editorSchema = z.object({
  bureau: z.string().min(1, "Bureau is required"),
  section: z.string().min(1, "Section is required"),
  sourcePath: z.string().min(1, "Source Path is required"),
  targetField: z.string().min(1, "Target Field is required"),
  transformType: z.string().min(1, "Transform Type is required"),
  transformConfigStr: z.string().optional(),
  priority: z.number().int().min(0),
  description: z.string().optional(),
  isActive: z.boolean(),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mapping: Selectable<ParserFieldMapping> | null;
}

export const ParserMappingEditor = ({ open, onOpenChange, mapping }: Props) => {
  const isEditing = !!mapping;
  const createMutation = useCreateParserMapping();
  const updateMutation = useUpdateParserMapping();
  const { showSuccess, showError } = useToast();
  const [jsonError, setJsonError] = useState<string | null>(null);

  const form = useForm({
    schema: editorSchema,
    defaultValues: {
      bureau: "",
      section: "",
      sourcePath: "",
      targetField: "",
      transformType: "direct",
      transformConfigStr: "",
      priority: 0,
      description: "",
      isActive: true,
    },
  });

  const { setValues } = form;

  useEffect(() => {
    if (open) {
      setJsonError(null);
      if (mapping) {
        setValues({
          bureau: mapping.bureau,
          section: mapping.section,
          sourcePath: mapping.sourcePath,
          targetField: mapping.targetField,
          transformType: mapping.transformType || "direct",
          transformConfigStr: mapping.transformConfig
            ? JSON.stringify(mapping.transformConfig, null, 2)
            : "",
          priority: mapping.priority,
          description: mapping.description || "",
          isActive: mapping.isActive,
        });
      } else {
        setValues({
          bureau: "",
          section: "",
          sourcePath: "",
          targetField: "",
          transformType: "direct",
          transformConfigStr: "",
          priority: 0,
          description: "",
          isActive: true,
        });
      }
    }
  }, [open, mapping, setValues]);

  const onSubmit = async (values: z.infer<typeof editorSchema>) => {
    setJsonError(null);
    let parsedConfig = undefined;

    if (values.transformConfigStr && values.transformConfigStr.trim() !== "") {
      try {
        parsedConfig = JSON.parse(values.transformConfigStr);
      } catch (err) {
        setJsonError("Invalid JSON configuration");
        return;
      }
    }

    try {
      if (isEditing && mapping) {
        await updateMutation.mutateAsync({
          id: mapping.id,
          sourcePath: values.sourcePath,
          targetField: values.targetField,
          section: values.section,
          transformType: values.transformType,
          transformConfig: parsedConfig,
          priority: values.priority,
          isActive: values.isActive,
          description: values.description,
        });
        showSuccess("Mapping updated successfully");
      } else {
        await createMutation.mutateAsync({
          bureau: values.bureau,
          sourcePath: values.sourcePath,
          targetField: values.targetField,
          section: values.section,
          transformType: values.transformType,
          transformConfig: parsedConfig,
          priority: values.priority,
          isActive: values.isActive,
          description: values.description,
        });
        showSuccess("Mapping created successfully");
      }
      onOpenChange(false);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to save mapping");
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={styles.sheetContent}>
        <SheetHeader>
          <SheetTitle>
            {isEditing ? "Edit Parser Mapping" : "Create Parser Mapping"}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Modify the existing field mapping override."
              : "Create a new field mapping override to dynamically fix ingestion drift."}
          </SheetDescription>
        </SheetHeader>

        <div className={styles.formScrollContainer}>
          <Form {...form}>
            <form id="mapping-form" onSubmit={form.handleSubmit(onSubmit)}>
              <div className={styles.formGrid}>
                {!isEditing && (
                  <FormItem name="bureau">
                    <FormLabel>Bureau</FormLabel>
                    <FormControl>
                      <Select
                        value={form.values.bureau}
                        onValueChange={(val) =>
                          setValues((p) => ({ ...p, bureau: val }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Bureau" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TransUnion">TransUnion</SelectItem>
                          <SelectItem value="Equifax">Equifax</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}

                <FormItem name="section">
                  <FormLabel>Section</FormLabel>
                  <FormControl>
                    <Select
                      value={form.values.section}
                      onValueChange={(val) =>
                        setValues((p) => ({ ...p, section: val }))
                      }
                      disabled={isEditing}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Section" />
                      </SelectTrigger>
                      <SelectContent>
                        {SECTIONS.map((sec) => (
                          <SelectItem key={sec} value={sec}>
                            {sec.replace("_", " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormDescription>
                    The data bucket this field maps into. Cannot be changed
                    after creation.
                  </FormDescription>
                  <FormMessage />
                </FormItem>

                <FormItem name="sourcePath">
                  <FormLabel>Source Path</FormLabel>
                  <FormControl>
                    <Input
                      value={form.values.sourcePath}
                      onChange={(e) =>
                        setValues((p) => ({ ...p, sourcePath: e.target.value }))
                      }
                      placeholder="e.g. consumerInfo.fullName"
                    />
                  </FormControl>
                  <FormDescription>
                    The dot-notated JSON path from the raw extracted output.
                  </FormDescription>
                  <FormMessage />
                </FormItem>

                <FormItem name="targetField">
                  <FormLabel>Target Field</FormLabel>
                  <FormControl>
                    <Input
                      value={form.values.targetField}
                      onChange={(e) =>
                        setValues((p) => ({
                          ...p,
                          targetField: e.target.value,
                        }))
                      }
                      placeholder="e.g. fullName"
                    />
                  </FormControl>
                  <FormDescription>
                    The destination field in the final comprehensive result.
                  </FormDescription>
                  <FormMessage />
                </FormItem>

                <FormItem name="transformType">
                  <FormLabel>Transform Type</FormLabel>
                  <FormControl>
                    <Select
                      value={form.values.transformType}
                      onValueChange={(val) =>
                        setValues((p) => ({ ...p, transformType: val }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select transform type" />
                      </SelectTrigger>
                      <SelectContent>
                        {TRANSFORM_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>

                <FormItem name="transformConfigStr">
                  <FormLabel>Transform Configuration (JSON)</FormLabel>
                  <FormControl>
                    <Textarea
                      className={styles.jsonTextarea}
                      value={form.values.transformConfigStr}
                      onChange={(e) => {
                        setJsonError(null);
                        setValues((p) => ({
                          ...p,
                          transformConfigStr: e.target.value,
                        }));
                      }}
                      placeholder='e.g. { "pattern": "\\d+" }'
                    />
                  </FormControl>
                  <FormDescription>
                    Optional JSON configuration for complex transforms (e.g.,
                    regex_extract).
                  </FormDescription>
                  {jsonError && (
                    <p className={styles.jsonErrorText}>{jsonError}</p>
                  )}
                  <FormMessage />
                </FormItem>

                <div className={styles.row}>
                  <FormItem name="priority">
                    <FormLabel>Priority</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        value={form.values.priority}
                        onChange={(e) =>
                          setValues((p) => ({
                            ...p,
                            priority: parseInt(e.target.value, 10) || 0,
                          }))
                        }
                      />
                    </FormControl>
                    <FormDescription>Higher applies first.</FormDescription>
                    <FormMessage />
                  </FormItem>

                  <FormItem name="isActive">
                    <FormLabel>Status</FormLabel>
                    <FormControl>
                      <div className={styles.switchWrapper}>
                        <Switch
                          checked={form.values.isActive}
                          onCheckedChange={(checked) =>
                            setValues((p) => ({ ...p, isActive: checked }))
                          }
                        />
                        <span className={styles.switchLabel}>
                          {form.values.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                </div>

                <FormItem name="description">
                  <FormLabel>Notes / Description</FormLabel>
                  <FormControl>
                    <Textarea
                      value={form.values.description}
                      onChange={(e) =>
                        setValues((p) => ({
                          ...p,
                          description: e.target.value,
                        }))
                      }
                      placeholder="Why was this override added?"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              </div>
            </form>
          </Form>
        </div>

        <SheetFooter className={styles.footer}>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" form="mapping-form" disabled={isPending}>
            {isPending ? "Saving..." : isEditing ? "Save Changes" : "Create Override"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};