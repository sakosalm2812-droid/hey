import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

import HEYButton from "../Button/HEYButton";

import Section from "../Section/Section";

import styles from "./FinalCTA.module.css";


export default function FinalCTA(){
const navigate = useNavigate();

return (

<Section>

<div className={styles.wrapper}>


<motion.h2

initial={{
opacity:0,
y:40
}}

whileInView={{
opacity:1,
y:0
}}

viewport={{
once:true
}}

>

Your intelligence

<br/>

is waiting.

</motion.h2>



<p>

Step into a personal intelligence system built around you.

</p>



<HEYButton
variant="primary"
icon={<ArrowRight size={18}/>}
onClick={() => navigate("/signup")}
>

Enter HEY

</HEYButton>



</div>

</Section>

);

}
