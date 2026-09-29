package com.obsidianmedia.learnwithalphonso.billing

import android.app.Activity
import android.content.Context
import com.obsidianmedia.learnwithalphonso.core.logic.BillingPeriodUnit
import com.revenuecat.purchases.Package
import com.revenuecat.purchases.PurchaseParams
import com.revenuecat.purchases.Purchases
import com.revenuecat.purchases.PurchasesConfiguration
import com.revenuecat.purchases.awaitCustomerInfo
import com.revenuecat.purchases.awaitLogIn
import com.revenuecat.purchases.awaitOfferings
import com.revenuecat.purchases.awaitPurchase
import com.revenuecat.purchases.awaitRestore
import com.revenuecat.purchases.models.Period
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

const val PRO_ENTITLEMENT_ID = "pro"

data class BillingPackage(val id: String, val priceString: String, val periodUnit: BillingPeriodUnit?, val periodValue: Int)

/** What EntitlementStore needs from a store SDK; RevenueCatBilling implements it, tests fake it. */
interface BillingPort {
    suspend fun logIn(userId: String): Boolean
    suspend fun isPro(): Boolean
    suspend fun packages(): List<BillingPackage>
    suspend fun purchase(activity: Activity, pkg: BillingPackage): Boolean
    suspend fun restore(): Boolean
}

data class EntitlementUiState(val isPro: Boolean = false, val packages: List<BillingPackage> = emptyList(), val isLoading: Boolean = false, val error: String? = null)

/** Port of EntitlementStore.swift. A null port is "this build has no store key". */
class EntitlementStore(private val port: BillingPort?) {
    private val _state = MutableStateFlow(EntitlementUiState())
    val state: StateFlow<EntitlementUiState> = _state.asStateFlow()
    val isPro: Boolean get() = _state.value.isPro

    private val unavailable = "Subscriptions aren't available in this build yet."

    suspend fun login(userId: String) {
        val p = port ?: return
        runCatching { p.logIn(userId) }.getOrNull()?.let { pro -> _state.update { it.copy(isPro = pro) } }
    }

    suspend fun refresh() {
        val p = port ?: run { _state.update { it.copy(isPro = false) }; return }
        _state.update { it.copy(isPro = runCatching { p.isPro() }.getOrDefault(false)) }
    }

    suspend fun loadOffering() {
        val p = port ?: run { _state.update { it.copy(packages = emptyList(), error = unavailable) }; return }
        _state.update { it.copy(isLoading = true, error = null) }
        val result = runCatching { p.packages() }
        _state.update {
            it.copy(
                isLoading = false,
                packages = result.getOrDefault(emptyList()),
                error = if (result.isFailure) "Subscription options aren't available yet. This unlocks once Google Play finishes reviewing our subscription." else null,
            )
        }
    }

    suspend fun purchase(activity: Activity, pkg: BillingPackage) {
        val p = port ?: run { _state.update { it.copy(error = unavailable) }; return }
        _state.update { it.copy(error = null) }
        val result = runCatching { p.purchase(activity, pkg) }
        _state.update { it.copy(isPro = result.getOrDefault(it.isPro), error = if (result.isFailure) "Purchase couldn't be completed. Please try again." else null) }
    }

    suspend fun restorePurchases() {
        val p = port ?: run { _state.update { it.copy(error = unavailable) }; return }
        _state.update { it.copy(error = null) }
        val result = runCatching { p.restore() }
        _state.update { it.copy(isPro = result.getOrDefault(it.isPro), error = if (result.isFailure) "Couldn't restore purchases. Please try again." else null) }
    }
}

/** The RevenueCat SDK behind BillingPort. Created only when a public key is configured. */
class RevenueCatBilling private constructor() : BillingPort {
    private val purchases get() = Purchases.sharedInstance

    override suspend fun logIn(userId: String): Boolean = purchases.awaitLogIn(userId).customerInfo.entitlements[PRO_ENTITLEMENT_ID]?.isActive == true
    override suspend fun isPro(): Boolean = purchases.awaitCustomerInfo().entitlements[PRO_ENTITLEMENT_ID]?.isActive == true

    override suspend fun packages(): List<BillingPackage> {
        val current = purchases.awaitOfferings().current ?: return emptyList()
        return current.availablePackages.map { it.toBillingPackage() }
    }

    override suspend fun purchase(activity: Activity, pkg: BillingPackage): Boolean {
        val rcPackage: Package = purchases.awaitOfferings().current?.availablePackages?.firstOrNull { it.identifier == pkg.id } ?: return false
        val result = purchases.awaitPurchase(PurchaseParams.Builder(activity, rcPackage).build())
        return result.customerInfo.entitlements[PRO_ENTITLEMENT_ID]?.isActive == true
    }

    override suspend fun restore(): Boolean = purchases.awaitRestore().entitlements[PRO_ENTITLEMENT_ID]?.isActive == true

    private fun Package.toBillingPackage(): BillingPackage {
        val period = product.period
        val unit = when (period?.unit) {
            Period.Unit.DAY -> BillingPeriodUnit.DAY
            Period.Unit.WEEK -> BillingPeriodUnit.WEEK
            Period.Unit.MONTH -> BillingPeriodUnit.MONTH
            Period.Unit.YEAR -> BillingPeriodUnit.YEAR
            else -> null
        }
        return BillingPackage(identifier, product.price.formatted, unit, period?.value ?: 1)
    }

    companion object {
        /** Null when the key is empty (no store in this build); configures the SDK once otherwise. */
        fun createIfConfigured(context: Context, publicKey: String): BillingPort? {
            if (publicKey.isBlank()) return null
            if (!Purchases.isConfigured) Purchases.configure(PurchasesConfiguration.Builder(context, publicKey).build())
            return RevenueCatBilling()
        }
    }
}
