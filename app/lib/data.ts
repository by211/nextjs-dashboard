import { createClient } from '@supabase/supabase-js';
import {
  CustomerField,
  CustomersTableType,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  Revenue,
} from './definitions';
import { formatCurrency } from './utils';
import { invoices } from './placeholder-data';

// Initialize Supabase client
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function fetchRevenue() {
  try {
    console.log('Fetching revenue data...');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const { data, error } = await supabase
        .from('revenue')
        .select('*');

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch revenue data.');
  }
}

export async function fetchLatestInvoices() {
  try {
    const { data, error } = await supabase
        .from('invoices')
        .select(`
        amount,
        id,
        customers (
          name,
          image_url,
          email
        )
      `)
        .order('date', { ascending: false })
        .limit(5);

    if (error) throw error;

    const latestInvoices = data.map((invoice: { customers: { name: any; email: any; image_url: any; }; amount: number; }) => ({
      ...invoice,
      name: invoice.customers.name,
      email: invoice.customers.email,
      image_url: invoice.customers.image_url,
      amount: formatCurrency(invoice.amount),
    }));

    return latestInvoices;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch the latest invoices.');
  }
}

export async function fetchCardData() {
  try {
    // Fetch invoice count
    const { count: invoiceCount, error: invoiceError } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true });

    if (invoiceError) throw invoiceError;

    // Fetch customer count
    const { count: customerCount, error: customerError } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });

    if (customerError) throw customerError;

    // Fetch invoice status totals
    const { data: statusData, error: statusError } = await supabase
        .from('invoices')
        .select('amount, status');

    if (statusError) throw statusError;

    const { paid, pending } = statusData.reduce(
        (acc: { paid: any; pending: any; }, invoice: { status: string; amount: any; }) => ({
          paid: acc.paid + (invoice.status === 'paid' ? invoice.amount : 0),
          pending: acc.pending + (invoice.status === 'pending' ? invoice.amount : 0),
        }),
        { paid: 0, pending: 0 }
    );

    return {
      numberOfCustomers: customerCount ?? 0,
      numberOfInvoices: invoiceCount ?? 0,
      totalPaidInvoices: formatCurrency(paid),
      totalPendingInvoices: formatCurrency(pending),
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch card data.');
  }
}

const ITEMS_PER_PAGE = 6;
export async function fetchFilteredInvoices(
    query: string,
    currentPage: number,
) {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;
  try {
    const { data, error } = await supabase
        .from('invoices')
        .select(`
        id,
        amount,
        date,
        status,
        customers!inner (
          name,
          email,
          image_url
        )
      `)
        .or(`email.ilike.*${query}*, name.ilike.*${query}*`, {referencedTable: 'customers'})
        // .or(`name.ilike.*${query}*`, {referencedTable: 'customers'})
        .order('date', { ascending: false })
        .range(offset, offset + ITEMS_PER_PAGE - 1);

    // console.log(data)
    // console.log(error)
    if (error) throw error;
    return data

    // if (error) throw error;

    // return data.map((invoice: { customers: { name: any; email: any; image_url: any; }; }) => ({
    //   ...invoice,
    //   name: invoice.customers.name,
    //   email: invoice.customers.email,
    //   image_url: invoice.customers.image_url,
    // }));
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoices.');
  }
}

export async function fetchInvoicesPages(query: string) {
  try {
    const { data, error } = await supabase
        .from('invoices')
        .select(`
        id,
        amount,
        date,
        status,
        customers!inner (
          name,
          email,
          image_url
        )
      `)
        .or(`email.ilike.*${query}*, name.ilike.*${query}*`, {referencedTable: 'customers'})
        // .or(`name.ilike.*${query}*`, {referencedTable: 'customers'})
        .order('date', { ascending: false });

    // console.log(data)
    // console.log(error)
    if (error) throw error;

    const totalPages = Math.ceil((data ?? 0) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch total number of invoices.');
  }
}

export async function fetchInvoiceById(id: string) {
  try {
    const { data, error } = await supabase
        .from('invoices')
        .select('id, customer_id, amount, status')
        .eq('id', id)
        .single();

    if (error) throw error;

    return {
      ...data,
      amount: data.amount / 100,
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoice.');
  }
}

export async function fetchCustomers() {
  try {
    const { data, error } = await supabase
        .from('customers')
        .select('id, name')
        .order('name');

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch all customers.');
  }
}

export async function fetchFilteredCustomers(query: string) {
  try {
    const { data, error } = await supabase
        .from('customers')
        .select(`
        id,
        name,
        email,
        image_url,
        invoices (
          id,
          amount,
          status
        )
      `)
        .or(`
        name.ilike.%${query}%,
        email.ilike.%${query}%
      `);

    if (error) throw error;

    const customers = data.map((customer: { invoices: any[]; }) => {
      const total_invoices = customer.invoices.length;
      const total_pending = customer.invoices
          .filter(inv => inv.status === 'pending')
          .reduce((sum, inv) => sum + inv.amount, 0);
      const total_paid = customer.invoices
          .filter(inv => inv.status === 'paid')
          .reduce((sum, inv) => sum + inv.amount, 0);

      return {
        ...customer,
        total_invoices,
        total_pending: formatCurrency(total_pending),
        total_paid: formatCurrency(total_paid),
      };
    });

    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch customer table.');
  }
}