import React, { useState, useEffect } from "react";
import { useForm } from "./Form";
import { Form, FormItem, FormLabel, FormControl, FormMessage } from "./Form";
import { Input } from "./Input";
import { Button } from "./Button";
import { Textarea } from "./Textarea";
import { FileDropzone } from "./FileDropzone";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./Dialog";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "./Tabs";
import { Plus, Trash2, FileText, Save, X } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import styles from "./ParserTestCaseEditor.module.css";

// Define schema for the form
const tradelineSchema = z.object({
  accountNumber: z.string().optional(),
  creditorName: z.string().optional(),
  accountType: z.string().optional(),
  balance: z.string().optional(), // Using string to allow flexible input, can be parsed later
  status: z.string().optional(),
  openedDate: z.string().optional(),
  dateReported: z.string().optional(),
  highCredit: z.string().optional(),
  pastDue: z.string().optional(),
});

const consumerInfoSchema = z.object({
  fullName: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),
  dateOfBirth: z.string().optional(),
});

const testCaseSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  expectedConsumerInfo: consumerInfoSchema.optional(),
  expectedTradelines: z.array(tradelineSchema).optional(),
});

type TestCaseFormValues = z.infer<typeof testCaseSchema>;

interface ParserTestCaseEditorProps {
  testCase?: any; // Using any for flexibility with the API response type, but ideally should be typed
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: any) => Promise<void>;
}

export function ParserTestCaseEditor({
  testCase,
  open,
  onOpenChange,
  onSave,
}: ParserTestCaseEditorProps) {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm({
    schema: testCaseSchema,
    defaultValues: {
      name: "",
      description: "",
      expectedConsumerInfo: {},
      expectedTradelines: [],
    },
  });

  // Reset form when testCase changes or dialog opens
  useEffect(() => {
    if (open) {
      if (testCase) {
        form.setValues({
          name: testCase.name || "",
          description: testCase.description || "",
          expectedConsumerInfo: testCase.expectedConsumerInfo || {},
          expectedTradelines: testCase.expectedTradelines || [],
        });
        setPdfBase64(null); // Existing test cases don't need re-upload unless implemented
        setPdfFile(null);
      } else {
        form.setValues({
          name: "",
          description: "",
          expectedConsumerInfo: {},
          expectedTradelines: [],
        });
        setPdfBase64(null);
        setPdfFile(null);
      }
    }
  }, [open, testCase, form.setValues]);

  const handleFileSelect = async (files: File[]) => {
    if (files.length > 0) {
      const file = files[0];
      setPdfFile(file);
      
      // Convert to base64
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = reader.result as string;
        // Remove data URL prefix if present
        const base64Content = base64String.split(',')[1] || base64String;
        setPdfBase64(base64Content);
      };
      reader.readAsDataURL(file);
      
      // Auto-fill name if empty
      if (!form.values.name) {
        form.setValues(prev => ({ ...prev, name: file.name.replace('.pdf', '') }));
      }
    }
  };

  const handleSubmit = async (values: TestCaseFormValues) => {
    if (!testCase && !pdfBase64) {
      toast.error("Please upload a PDF file for the new test case");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...values,
        id: testCase?.id,
        pdfBase64: pdfBase64 || undefined, // Only send if new or updated
      };
      await onSave(payload);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save test case", error);
      toast.error("Failed to save test case");
    } finally {
      setIsSubmitting(false);
    }
  };

  const addTradeline = () => {
    form.setValues(prev => ({
      ...prev,
      expectedTradelines: [
        ...(prev.expectedTradelines || []),
        { accountNumber: "" }
      ]
    }));
  };

  const removeTradeline = (index: number) => {
    form.setValues(prev => {
      const newTradelines = [...(prev.expectedTradelines || [])];
      newTradelines.splice(index, 1);
      return { ...prev, expectedTradelines: newTradelines };
    });
  };

  const updateTradeline = (index: number, field: string, value: string) => {
    form.setValues(prev => {
      const newTradelines = [...(prev.expectedTradelines || [])];
      newTradelines[index] = { ...newTradelines[index], [field]: value };
      return { ...prev, expectedTradelines: newTradelines };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.dialogContent}>
        <DialogHeader>
          <DialogTitle>{testCase ? "Edit Test Case" : "Create New Test Case"}</DialogTitle>
        </DialogHeader>

        <div className={styles.container}>
          {/* Left Panel: PDF/Text View */}
          <div className={styles.leftPanel}>
            {!testCase && !pdfFile ? (
              <div className={styles.uploadContainer}>
                <FileDropzone
                  accept=".pdf"
                  onFilesSelected={handleFileSelect}
                  title="Upload Credit Report PDF"
                  subtitle="Drag and drop or click to select"
                />
              </div>
            ) : (
              <div className={styles.textPreview}>
                <div className={styles.panelHeader}>
                  <FileText size={16} />
                  <span>
                    {testCase ? "Extracted Text Preview" : `File: ${pdfFile?.name}`}
                  </span>
                  {!testCase && (
                    <Button variant="ghost" size="sm" onClick={() => { setPdfFile(null); setPdfBase64(null); }}>
                      Change
                    </Button>
                  )}
                </div>
                <div className={styles.textContent}>
                  {testCase?.rawExtractedText ? (
                    <pre className={styles.pre}>{testCase.rawExtractedText}</pre>
                  ) : (
                    <div className={styles.placeholderText}>
                      {testCase 
                        ? "No extracted text available. Run the test to generate text." 
                        : "Text will be extracted after saving and running the test."}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel: Form */}
          <div className={styles.rightPanel}>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className={styles.form}>
                <div className={styles.formHeader}>
                  <FormItem name="name">
                    <FormLabel>Test Case Name</FormLabel>
                    <FormControl>
                      <Input 
                        value={form.values.name} 
                        onChange={e => form.setValues(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g. Equifax Report - John Doe"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                  
                  <FormItem name="description">
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        value={form.values.description} 
                        onChange={e => form.setValues(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Optional description"
                        rows={2}
                      />
                    </FormControl>
                  </FormItem>
                </div>

                <Tabs defaultValue="consumer" className={styles.tabs}>
                  <TabsList className={styles.tabsList}>
                    <TabsTrigger value="consumer">Consumer Info</TabsTrigger>
                    <TabsTrigger value="tradelines">Tradelines ({form.values.expectedTradelines?.length || 0})</TabsTrigger>
                  </TabsList>

                  <TabsContent value="consumer" className={styles.tabContent}>
                    <div className={styles.fieldsGrid}>
                      <FormItem name="expectedConsumerInfo.fullName">
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input 
                            value={form.values.expectedConsumerInfo?.fullName || ""} 
                            onChange={e => form.setValues(prev => ({ 
                              ...prev, 
                              expectedConsumerInfo: { ...prev.expectedConsumerInfo, fullName: e.target.value } 
                            }))}
                          />
                        </FormControl>
                      </FormItem>
                      <FormItem name="expectedConsumerInfo.dateOfBirth">
                        <FormLabel>Date of Birth</FormLabel>
                        <FormControl>
                          <Input 
                            value={form.values.expectedConsumerInfo?.dateOfBirth || ""} 
                            onChange={e => form.setValues(prev => ({ 
                              ...prev, 
                              expectedConsumerInfo: { ...prev.expectedConsumerInfo, dateOfBirth: e.target.value } 
                            }))}
                            placeholder="YYYY-MM-DD"
                          />
                        </FormControl>
                      </FormItem>
                      <FormItem name="expectedConsumerInfo.addressLine1">
                        <FormLabel>Address Line 1</FormLabel>
                        <FormControl>
                          <Input 
                            value={form.values.expectedConsumerInfo?.addressLine1 || ""} 
                            onChange={e => form.setValues(prev => ({ 
                              ...prev, 
                              expectedConsumerInfo: { ...prev.expectedConsumerInfo, addressLine1: e.target.value } 
                            }))}
                          />
                        </FormControl>
                      </FormItem>
                      <FormItem name="expectedConsumerInfo.city">
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <Input 
                            value={form.values.expectedConsumerInfo?.city || ""} 
                            onChange={e => form.setValues(prev => ({ 
                              ...prev, 
                              expectedConsumerInfo: { ...prev.expectedConsumerInfo, city: e.target.value } 
                            }))}
                          />
                        </FormControl>
                      </FormItem>
                      <FormItem name="expectedConsumerInfo.province">
                        <FormLabel>Province</FormLabel>
                        <FormControl>
                          <Input 
                            value={form.values.expectedConsumerInfo?.province || ""} 
                            onChange={e => form.setValues(prev => ({ 
                              ...prev, 
                              expectedConsumerInfo: { ...prev.expectedConsumerInfo, province: e.target.value } 
                            }))}
                          />
                        </FormControl>
                      </FormItem>
                      <FormItem name="expectedConsumerInfo.postalCode">
                        <FormLabel>Postal Code</FormLabel>
                        <FormControl>
                          <Input 
                            value={form.values.expectedConsumerInfo?.postalCode || ""} 
                            onChange={e => form.setValues(prev => ({ 
                              ...prev, 
                              expectedConsumerInfo: { ...prev.expectedConsumerInfo, postalCode: e.target.value } 
                            }))}
                          />
                        </FormControl>
                      </FormItem>
                    </div>
                  </TabsContent>

                  <TabsContent value="tradelines" className={styles.tabContent}>
                    <div className={styles.tradelinesList}>
                      {form.values.expectedTradelines?.map((tl, index) => (
                        <div key={index} className={styles.tradelineCard}>
                          <div className={styles.tradelineHeader}>
                            <span className={styles.tradelineIndex}>#{index + 1}</span>
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="icon-sm" 
                              onClick={() => removeTradeline(index)}
                              className={styles.removeBtn}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                          <div className={styles.fieldsGrid}>
                            <FormItem name={`expectedTradelines.${index}.accountNumber`}>
                              <FormLabel>Account Number (if reported)</FormLabel>
                              <FormControl>
                                <Input 
                                  value={tl.accountNumber || ""} 
                                  onChange={e => updateTradeline(index, "accountNumber", e.target.value)}
                                />
                              </FormControl>
                            </FormItem>
                            <FormItem name={`expectedTradelines.${index}.creditorName`}>
                              <FormLabel>Creditor Name</FormLabel>
                              <FormControl>
                                <Input 
                                  value={tl.creditorName || ""} 
                                  onChange={e => updateTradeline(index, "creditorName", e.target.value)}
                                />
                              </FormControl>
                            </FormItem>
                            <FormItem name={`expectedTradelines.${index}.balance`}>
                              <FormLabel>Balance</FormLabel>
                              <FormControl>
                                <Input 
                                  value={tl.balance || ""} 
                                  onChange={e => updateTradeline(index, "balance", e.target.value)}
                                />
                              </FormControl>
                            </FormItem>
                            <FormItem name={`expectedTradelines.${index}.status`}>
                              <FormLabel>Status</FormLabel>
                              <FormControl>
                                <Input 
                                  value={tl.status || ""} 
                                  onChange={e => updateTradeline(index, "status", e.target.value)}
                                />
                              </FormControl>
                            </FormItem>
                          </div>
                        </div>
                      ))}
                      
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={addTradeline}
                        className={styles.addBtn}
                      >
                        <Plus size={16} /> Add Tradeline
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className={styles.footer}>
                  <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save Test Case"}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
