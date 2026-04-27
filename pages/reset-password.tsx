import React, { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { postResetPassword } from "../endpoints/auth/reset_password_POST.schema";
import { postRequestPasswordReset } from "../endpoints/auth/request_password_reset_POST.schema";
import { Form, FormItem, FormLabel, FormControl, FormMessage, useForm } from "../components/Form";
import { Input } from "../components/Input";
import { Button } from "../components/Button";
import { toast } from "sonner";
import styles from "./reset-password.module.css";

const requestSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

const resetSchema = z.object({
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
  confirmPassword: z.string()
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [requestSent, setRequestSent] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const requestForm = useForm({
    defaultValues: { email: "" },
    schema: requestSchema,
  });

  const resetForm = useForm({
    defaultValues: { newPassword: "", confirmPassword: "" },
    schema: resetSchema,
  });

  const requestMutation = useMutation({
    mutationFn: postRequestPasswordReset,
    onSuccess: (data) => {
      setRequestSent(true);
      toast.success(data.message);
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const resetMutation = useMutation({
    mutationFn: postResetPassword,
    onSuccess: () => {
      setResetSuccess(true);
      toast.success("Password has been reset successfully");
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const onRequestSubmit = (data: z.infer<typeof requestSchema>) => {
    requestMutation.mutate(data);
  };

  const onResetSubmit = (data: z.infer<typeof resetSchema>) => {
    if (!token) return;
    resetMutation.mutate({ token, newPassword: data.newPassword });
  };

  return (
    <>
      <Helmet>
        <title>Reset Password - Credit Regulator Pro</title>
        <meta name="description" content="Reset your password for Credit Regulator Pro" />
      </Helmet>

      <div className={styles.container}>
        <div className={styles.backgroundGlow} />
        
        <div className={styles.contentWrapper}>
          <div className={styles.logoWrapper}>
            <img 
              src="/brand/app-icon.png"
              alt="Credit Regulator Pro Logo" 
              className={styles.logoIcon} 
            />
            <h1 className={styles.brandName}>Credit Regulator Pro</h1>
          </div>

          <div className={styles.card}>
            {token ? (
              resetSuccess ? (
                <div className={styles.successState}>
                  <h2 className={styles.title}>Password Reset</h2>
                  <p className={styles.subtitle}>
                    Your password has been changed successfully.
                  </p>
                  <Button asChild className={styles.fullWidthButton}>
                    <Link to="/login">Go to Login</Link>
                  </Button>
                </div>
              ) : (
                <>
                  <div className={styles.cardHeader}>
                    <h2 className={styles.title}>Create New Password</h2>
                    <p className={styles.subtitle}>Enter a new password for your account.</p>
                  </div>

                  <Form {...resetForm}>
                    <form onSubmit={resetForm.handleSubmit(onResetSubmit)} className={styles.form}>
                      <FormItem name="newPassword">
                        <FormLabel>New Password</FormLabel>
                        <FormControl>
                          <Input 
                            type="password" 
                            placeholder="Enter new password"
                            value={resetForm.values.newPassword}
                            onChange={(e) => resetForm.setValues({ ...resetForm.values, newPassword: e.target.value })}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>

                      <FormItem name="confirmPassword">
                        <FormLabel>Confirm Password</FormLabel>
                        <FormControl>
                          <Input 
                            type="password" 
                            placeholder="Confirm new password"
                            value={resetForm.values.confirmPassword}
                            onChange={(e) => resetForm.setValues({ ...resetForm.values, confirmPassword: e.target.value })}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>

                      <Button 
                        type="submit" 
                        disabled={resetMutation.isPending}
                        className={styles.fullWidthButton}
                      >
                        {resetMutation.isPending ? "Resetting..." : "Reset Password"}
                      </Button>
                    </form>
                  </Form>
                </>
              )
            ) : (
              requestSent ? (
                <div className={styles.successState}>
                  <h2 className={styles.title}>Check Your Email</h2>
                  <p className={styles.subtitle}>
                    If that email is in our system, we have sent a link to reset your password. The link will expire in 1 hour.
                  </p>
                  <Button asChild variant="outline" className={styles.fullWidthButton}>
                    <Link to="/login">Return to Login</Link>
                  </Button>
                </div>
              ) : (
                <>
                  <div className={styles.cardHeader}>
                    <h2 className={styles.title}>Forgot Password?</h2>
                    <p className={styles.subtitle}>
                      Enter your email address to get a password reset link.
                    </p>
                  </div>

                  <Form {...requestForm}>
                    <form onSubmit={requestForm.handleSubmit(onRequestSubmit)} className={styles.form}>
                      <FormItem name="email">
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input 
                            type="email" 
                            placeholder="you@example.com"
                            value={requestForm.values.email}
                            onChange={(e) => requestForm.setValues({ ...requestForm.values, email: e.target.value })}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>

                      <Button 
                        type="submit" 
                        disabled={requestMutation.isPending}
                        className={styles.fullWidthButton}
                      >
                        {requestMutation.isPending ? "Sending..." : "Send Reset Link"}
                      </Button>
                    </form>
                  </Form>
                </>
              )
            )}
          </div>

          {!resetSuccess && !requestSent && (
            <div className={styles.footer}>
              <p className={styles.footerText}>
                Remembered your password?{" "}
                <Link to="/login" className={styles.link}>
                  Back to login
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
