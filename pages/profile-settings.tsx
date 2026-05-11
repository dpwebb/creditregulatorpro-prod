import { useSearchParams, useNavigate } from "react-router-dom";
import { useUserProfile } from "../helpers/useUserProfile";
import { useToast } from "../helpers/useToast";
import { PageHeader } from "../components/PageHeader";

import { Skeleton } from "../components/Skeleton";

import { ProfileForm, ProfileFormValues } from "../components/ProfileForm";
import { SubscriptionSection } from "../components/SubscriptionSection";
import styles from "./profile-settings.module.css";

export default function ProfileSettingsPage() {
  const { profile, isLoading, updateProfile, isUpdating } = useUserProfile();
  
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showSuccess } = useToast();

  const returnTo = searchParams.get("returnTo");

  const onSubmit = async (values: ProfileFormValues) => {
    try {
      await updateProfile(values);
      
      if (returnTo?.startsWith("/")) {
        showSuccess("Profile updated!", {
          description: "Taking you back...",
        });
        navigate(returnTo);
      }
    } catch (error) {
      console.error("Failed to update profile", error);
      // Error toast is handled by the hook
    }
  };

  if (isLoading || !profile) {
    return (
      <div className={styles.container}>
        <PageHeader
          title="Your Info"
          subtitle="Make sure your info is right so your dispute letters are correct"
          
        />
        <div className={styles.loadingContainer}>
          <Skeleton className={styles.skeletonInput} />
          <Skeleton className={styles.skeletonInput} />
          <div className={styles.skeletonRow}>
            <Skeleton className={styles.skeletonInput} />
            <Skeleton className={styles.skeletonInput} />
          </div>
          <Skeleton className={styles.skeletonButton} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <PageHeader
        title="Your Info"
        subtitle="Make sure your info is right so your dispute letters are correct"
        
      />

      <div className={styles.content}>
        <SubscriptionSection />

        <div className={styles.infoBox}>
          <p>
            <strong>Important:</strong> This info goes into your dispute letters. Make sure it matches your ID and where you live right now.
          </p>
        </div>

        <ProfileForm 
          initialData={profile}
          isUpdating={isUpdating}
          onSubmit={onSubmit}
        />
      </div>
    </div>
  );
}
