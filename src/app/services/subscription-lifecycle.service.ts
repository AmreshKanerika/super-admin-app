import { Injectable, inject } from '@angular/core';
import { ConfirmService } from '../core/confirm.service';
import { ToastService } from '../core/toast.service';
import { formatDate } from '../core/status.util';
import { OrgSubscribedPlan } from '../models';
import { OrganizationsService } from './organizations.service';
import { SubscriptionsService } from './subscriptions.service';

@Injectable({ providedIn: 'root' })
export class SubscriptionLifecycleService {
  private subscriptions = inject(SubscriptionsService);
  private organizations = inject(OrganizationsService);
  private confirm = inject(ConfirmService);
  private toast = inject(ToastService);

  isManagedInAzureMarketplace(subscription: OrgSubscribedPlan): boolean {
    return subscription.azureMarketplaceManaged === true;
  }

  async extend(subscription: OrgSubscribedPlan): Promise<boolean> {
    if (this.refuseWhenManagedInAzureMarketplace(subscription)) return false;

    // open-ended subscription (no end date): extend from today
    const currentEnd = subscription.planEndDate ? new Date(subscription.planEndDate) : new Date();
    const proposed = new Date(currentEnd);
    proposed.setDate(proposed.getDate() + 90);
    const earliestAllowed = new Date(currentEnd);
    earliestAllowed.setDate(earliestAllowed.getDate() + 1);

    return this.askForNewEndDate(subscription, {
      title: 'Extend subscription',
      message: `${this.orgName(subscription)} — current end date is ${formatDate(subscription.planEndDate)}. Choose a new, later end date.`,
      danger: false,
      proposed,
      min: earliestAllowed,
      max: null,
      successMessage: 'Subscription extended'
    });
  }

  async shorten(subscription: OrgSubscribedPlan): Promise<boolean> {
    if (this.refuseWhenManagedInAzureMarketplace(subscription)) return false;
    if (!subscription.planEndDate) {
      this.toast.show('This subscription has no end date - use Extend to set one first', 'critical');
      return false;
    }

    const currentEnd = new Date(subscription.planEndDate);
    const proposed = new Date(currentEnd);
    proposed.setDate(proposed.getDate() - 30);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(subscription.planStartDate);
    const earliestAllowed = start > today ? start : today;
    const latestAllowed = new Date(currentEnd);
    latestAllowed.setDate(latestAllowed.getDate() - 1);

    if (earliestAllowed >= latestAllowed) {
      this.toast.show('This subscription cannot be shortened any further', 'critical');
      return false;
    }
    if (proposed < earliestAllowed) proposed.setTime(earliestAllowed.getTime());

    return this.askForNewEndDate(subscription, {
      title: 'Shorten subscription',
      message: `${this.orgName(subscription)} — current end date is ${formatDate(subscription.planEndDate)}. Choose a new, earlier end date.`,
      danger: true,
      proposed,
      min: earliestAllowed,
      max: latestAllowed,
      successMessage: 'Subscription shortened'
    });
  }

  async suspend(subscription: OrgSubscribedPlan): Promise<boolean> {
    if (this.refuseWhenManagedInAzureMarketplace(subscription)) return false;

    const result = await this.confirm.open({
      title: 'Suspend subscription',
      message: `${this.orgName(subscription)} loses access to every application immediately.`,
      danger: true,
      reasonRequired: true,
      confirmLabel: 'Suspend access'
    });
    if (!result.confirmed) return false;

    await this.subscriptions.setStatus(subscription.subscriptionId, 'SUSPENDED', result.reason);
    this.toast.show('Subscription suspended', 'critical');
    return true;
  }

  async deactivate(subscription: OrgSubscribedPlan): Promise<boolean> {
    if (this.refuseWhenManagedInAzureMarketplace(subscription)) return false;

    const result = await this.confirm.open({
      title: 'Deactivate subscription',
      message: `${this.orgName(subscription)} keeps the subscription and its dates, but loses access until it is reactivated.`,
      danger: true,
      reasonRequired: true,
      confirmLabel: 'Deactivate'
    });
    if (!result.confirmed) return false;

    await this.subscriptions.setStatus(subscription.subscriptionId, 'INACTIVE', result.reason);
    this.toast.show('Subscription deactivated', 'critical');
    return true;
  }

  async reactivate(subscription: OrgSubscribedPlan): Promise<boolean> {
    if (this.refuseWhenManagedInAzureMarketplace(subscription)) return false;

    const result = await this.confirm.open({
      title: 'Reactivate subscription',
      message: `Access is restored immediately for ${this.orgName(subscription)}.`,
      reasonRequired: true,
      confirmLabel: 'Reactivate'
    });
    if (!result.confirmed) return false;

    await this.subscriptions.setStatus(subscription.subscriptionId, 'ACTIVE', result.reason);
    this.toast.show('Subscription reactivated', 'success');
    return true;
  }

  async cancel(subscription: OrgSubscribedPlan): Promise<boolean> {
    if (this.refuseWhenManagedInAzureMarketplace(subscription)) return false;

    const orgName = this.orgName(subscription);
    const result = await this.confirm.open({
      title: 'Cancel subscription',
      message: `This ends ${orgName}'s subscription. It will not renew and access ends at the current expiry date.`,
      danger: true,
      requireTypedText: orgName,
      confirmLabel: 'Cancel subscription'
    });
    if (!result.confirmed) return false;

    await this.subscriptions.setStatus(subscription.subscriptionId, 'CANCELLED', result.reason);
    this.toast.show('Subscription cancelled', 'critical');
    return true;
  }

  private async askForNewEndDate(
    subscription: OrgSubscribedPlan,
    options: {
      title: string;
      message: string;
      danger: boolean;
      proposed: Date;
      min: Date;
      max: Date | null;
      successMessage: string;
    }
  ): Promise<boolean> {
    let appliedEndDate: string | null = null;

    const result = await this.confirm.open({
      title: options.title,
      message: options.message,
      danger: options.danger,
      reasonRequired: true,
      confirmLabel: 'Apply change',
      extraInput: {
        type: 'date',
        label: 'New plan end date',
        value: asDateInputValue(options.proposed),
        min: asDateInputValue(options.min),
        ...(options.max ? { max: asDateInputValue(options.max) } : {})
      },
      onConfirm: async (reason: string, chosenDate?: string) => {
        const chosen = new Date(chosenDate + 'T00:00:00.000Z').toISOString();
        if (subscription.planEndDate && chosen === new Date(subscription.planEndDate).toISOString()) return;
        await this.subscriptions.extend(subscription.subscriptionId, chosen, reason ?? '');
        appliedEndDate = chosen;
      }
    });

    if (!result.confirmed) return false;
    if (!appliedEndDate) {
      this.toast.show('End date unchanged — nothing to apply', 'neutral');
      return false;
    }

    this.toast.show(options.successMessage, 'success');
    return true;
  }

  private refuseWhenManagedInAzureMarketplace(subscription: OrgSubscribedPlan): boolean {
    if (!this.isManagedInAzureMarketplace(subscription)) return false;
    this.toast.show(
      'This subscription came from the Azure Marketplace and is managed there. Change it in the customer’s Azure subscription instead.',
      'critical'
    );
    return true;
  }

  private orgName(subscription: OrgSubscribedPlan): string {
    return this.organizations.byId(subscription.orgId)?.organizationName ?? subscription.orgId;
  }
}

function asDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}
