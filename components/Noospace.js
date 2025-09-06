import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@supabase/supabase-js";

const DAILY_LIMIT = 3;
const MAX_CHARS = 240;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ljnjdguqjrevhhuwkaxg.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqbmpkZ3VxanJldmhodXdrYXhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5NzU0NDgsImV4cCI6MjA3MjU1MTQ0OH0._MRu-P-0r7hZ8i-Oh5xnYMaRNMEr1Vzw2tlKocMC6G4";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function Noospace({ guestMode = false }) {
  const [entries, setEntries] = useState([]);
  const [text, setText] = useState("");
  const [symbol, setSymbol] = useState("✶");
  const [tags, setTags] = useState("");
  const [view, setView] = useState("spiral");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [wallet, setWallet] = useState(null);
  const [connected, setConnected] = useState(false);
  const [earning, setEarning] = useState(0); // placeholder for NOO earnings display
  const [session, setSession] = useState(null);

  useEffect(() => {
    fetchEntries();
    checkSession();

    if (typeof window !== 'undefined' && window.solana && window.solana.isPhantom) {
      window.solana.on('connect', handleConnect);
      window.solana.on('disconnect', handleDisconnect);
    }

    // Auth Listener für Session-Changes
    const { data: authListener } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      if (sess) {
        extractWalletFromUser(sess.user);
      } else {
        setWallet(null);
        setConnected(false);
      }
    });

    if (guestMode) {
      setConnected(false);
      setWallet(null);
    }

    return () => {
      authListener.subscription.unsubscribe();
      if (window.solana) {
        window.solana.off('connect', handleConnect);
        window.solana.off('disconnect', handleDisconnect);
      }
    };
  }, []);

  async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    setSession(session);
    if (session) {
      setConnected(true);
      extractWalletFromUser(session.user);
    }
  }

  async function extractWalletFromUser(user) {
    if (!user) return;
    const web3Identity = user.identities?.find(i => i.provider === 'web3');
    const walletAddress = web3Identity?.identity_data?.public_key;
    if (walletAddress) {
      setWallet(walletAddress);
    } else {
      setError("Could not extract wallet from user.");
    }
  }

  async function handleConnect() {
    if (window.solana.publicKey) {
      await signInWithPhantom();
    }
  }

  async function handleDisconnect() {
    await supabase.auth.signOut();
    setConnected(false);
    setWallet(null);
    setEarning(0);
  }

  async function connectPhantom() {
    try {
      if (!window.solana || !window.solana.isPhantom) {
        setError("Phantom wallet not found. Please install Phantom[](https://phantom.app).");
        return;
      }
      await window.solana.connect();
      await signInWithPhantom();
    } catch (err) {
      console.error("Phantom connect error", err);
      setError("Could not connect Phantom.");
    }
  }

  async function signInWithPhantom() {
    try {
      const { data, error } = await supabase.auth.signInWithWeb3({
        chain: 'solana',
        statement: 'Sign in to Noospace to earn NOO tokens through activity.', // Erscheint im Phantom-Dialog
      });
      if (error) throw error;
      setConnected(true);
      setEarning(prev => prev + 1); // Placeholder
      await checkSession(); // Refresh Session
    } catch (err) {
      console.error("Sign-in error", err);
      setError("Could not sign in with Phantom.");
    }
  }

  async function disconnectPhantom() {
    try {
      if (window.solana && window.solana.isPhantom) {
        await window.solana.disconnect();
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchEntries() {
    setError("");
    try {
      const { data, error } = await supabase.from("entries").select("*").order("date", { ascending: true });
      if (error) throw error;
      setEntries(data || []);
    } catch (err) {
      console.error("Fetch error:", err);
      setError("Could not fetch entries from Supabase.");
    }
  }

  // ... (filtered, todayKey, countToday bleiben gleich)

  async function addEntry() {
    setError("");
    if (!session && !guestMode) {
      setError("Connect and sign in with Phantom to inscribe.");
      return;
    }
    const trimmed = text.trim();
    const tgs = tags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean).slice(0,5);
    if (!trimmed) { setError("Write a short impulse."); return; }
    if (trimmed.length > MAX_CHARS) { setError("Too long."); return; }
    if (countToday() >= DAILY_LIMIT) { setError("Daily ritual limit reached."); return; }

    const row = { 
      text: trimmed, 
      symbol: (symbol||"✶").slice(0,2), 
      tags: tgs.length ? tgs : ["untagged"], 
      wallet: wallet || null, 
      date: new Date().toISOString(), 
      stars: 0,
      user_id: session?.user?.id || null // Setze User-ID für Ownership
    };
    try {
      const { data, error } = await supabase.from("entries").insert([row]).select();
      if (error) { console.error("Insert error", error); setError("Could not save entry."); return; }
      setEntries(prev => [...prev, ...data]);
      setText(""); setTags("");
      if (wallet) setEarning(prev => prev + 1);
    } catch (err) { console.error("Insert exception", err); setError("Could not save entry."); }
  }

  // starEntry und deleteEntry: Passe ggf. an, um Owner zu checken (aber da RLS das handhabt, optional)

  async function deleteEntry(id) {
    try {
      const { error } = await supabase.from("entries").delete().eq("id", id);
      if (error) throw error;
      setEntries(prev => prev.filter(p => p.id !== id));
    } catch (err) { console.error(err); setError("Could not delete."); }
  }

  // ... (Rest des Codes: SpiralView, return JSX bleibt ähnlich, aber disable Inscribe-Button wenn !connected && !guestMode)

  // Im JSX, für Composer: 
  // <button onClick={addEntry} className="inscribe" disabled={!connected && !guestMode}>Inscribe</button>
}
