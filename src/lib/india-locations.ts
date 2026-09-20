// Complete India States & Cities data for standardized location selection

export interface StateData {
  name: string;
  cities: string[];
}

export const INDIA_STATES: StateData[] = [
  { name: 'Andhra Pradesh', cities: ['Visakhapatnam','Vijayawada','Guntur','Nellore','Kurnool','Tirupati','Rajahmundry','Kakinada','Anantapur','Eluru','Ongole','Kadapa','Srikakulam'] },
  { name: 'Arunachal Pradesh', cities: ['Itanagar','Naharlagun','Tawang','Ziro','Pasighat','Bomdila'] },
  { name: 'Assam', cities: ['Guwahati','Silchar','Dibrugarh','Jorhat','Nagaon','Tinsukia','Tezpur'] },
  { name: 'Bihar', cities: ['Patna','Gaya','Bhagalpur','Muzaffarpur','Purnia','Darbhanga','Bihar Sharif','Arrah','Begusarai','Katihar','Munger','Chhapra','Samastipur','Hajipur'] },
  { name: 'Chhattisgarh', cities: ['Raipur','Bhilai','Durg','Korba','Bilaspur','Rajnandgaon','Jagdalpur','Raigarh'] },
  { name: 'Goa', cities: ['Panaji','Margao','Vasco da Gama','Mapusa','Ponda'] },
  { name: 'Gujarat', cities: ['Ahmedabad','Surat','Vadodara','Rajkot','Bhavnagar','Jamnagar','Junagadh','Gandhinagar','Anand','Nadiad','Morbi','Mehsana','Bharuch','Navsari','Valsad','Vapi','Gandhidham'] },
  { name: 'Haryana', cities: ['Gurugram','Faridabad','Panipat','Ambala','Karnal','Hisar','Rohtak','Sonipat','Yamunanagar','Panchkula','Bhiwani','Sirsa','Rewari','Jind','Bahadurgarh','Kurukshetra'] },
  { name: 'Himachal Pradesh', cities: ['Shimla','Dharamshala','Mandi','Solan','Nahan','Bilaspur','Hamirpur','Kullu','Manali','Una','Palampur'] },
  { name: 'Jharkhand', cities: ['Ranchi','Jamshedpur','Dhanbad','Bokaro','Hazaribagh','Deoghar','Giridih','Ramgarh'] },
  { name: 'Karnataka', cities: ['Bengaluru','Mysuru','Mangaluru','Hubballi','Dharwad','Belagavi','Kalaburagi','Ballari','Davanagere','Tumakuru','Shivamogga','Vijayapura','Raichur','Hassan','Udupi'] },
  { name: 'Kerala', cities: ['Thiruvananthapuram','Kochi','Kozhikode','Thrissur','Kollam','Alappuzha','Palakkad','Malappuram','Kannur','Kasaragod','Kottayam'] },
  { name: 'Madhya Pradesh', cities: ['Bhopal','Indore','Jabalpur','Gwalior','Ujjain','Sagar','Dewas','Satna','Ratlam','Rewa','Singrauli','Burhanpur','Khandwa','Chhindwara'] },
  { name: 'Maharashtra', cities: ['Mumbai','Pune','Nagpur','Nashik','Thane','Aurangabad','Navi Mumbai','Solapur','Kolhapur','Amravati','Sangli','Jalgaon','Akola','Latur','Dhule','Ahmednagar','Chandrapur','Parbhani','Jalna','Bhiwandi','Panvel','Satara','Nanded'] },
  { name: 'Manipur', cities: ['Imphal','Thoubal','Bishnupur','Churachandpur'] },
  { name: 'Meghalaya', cities: ['Shillong','Tura','Jowai','Nongstoin'] },
  { name: 'Mizoram', cities: ['Aizawl','Lunglei','Saiha','Champhai'] },
  { name: 'Nagaland', cities: ['Kohima','Dimapur','Mokokchung','Tuensang'] },
  { name: 'Odisha', cities: ['Bhubaneswar','Cuttack','Berhampur','Rourkela','Sambalpur','Puri','Balasore','Bhadrak','Baripada','Jharsuguda'] },
  { name: 'Punjab', cities: ['Ludhiana','Amritsar','Jalandhar','Patiala','Bathinda','Mohali','Hoshiarpur','Batala','Pathankot','Moga','Phagwara','Firozpur','Kapurthala'] },
  { name: 'Rajasthan', cities: ['Jaipur','Jodhpur','Udaipur','Kota','Ajmer','Bikaner','Bhilwara','Alwar','Sikar','Bharatpur','Pali','Sri Ganganagar','Tonk','Barmer','Chittorgarh'] },
  { name: 'Sikkim', cities: ['Gangtok','Namchi','Mangan','Gyalshing'] },
  { name: 'Tamil Nadu', cities: ['Chennai','Coimbatore','Madurai','Tiruchirappalli','Salem','Tirunelveli','Erode','Vellore','Thoothukudi','Thanjavur','Dindigul','Tirupur','Hosur'] },
  { name: 'Telangana', cities: ['Hyderabad','Warangal','Nizamabad','Karimnagar','Ramagundam','Khammam','Mahbubnagar','Nalgonda','Adilabad','Siddipet'] },
  { name: 'Tripura', cities: ['Agartala','Udaipur','Dharmanagar','Kailasahar'] },
  { name: 'Uttar Pradesh', cities: ['Lucknow','Kanpur','Ghaziabad','Agra','Varanasi','Meerut','Prayagraj','Bareilly','Aligarh','Moradabad','Gorakhpur','Saharanpur','Noida','Jhansi','Firozabad','Muzaffarnagar','Mathura','Ayodhya','Greater Noida'] },
  { name: 'Uttarakhand', cities: ['Dehradun','Haridwar','Rishikesh','Haldwani','Roorkee','Kashipur','Rudrapur','Nainital','Mussoorie'] },
  { name: 'West Bengal', cities: ['Kolkata','Howrah','Durgapur','Asansol','Siliguri','Bardhaman','Malda','Baharampur','Kharagpur','Haldia','Darjeeling'] },
  { name: 'Andaman and Nicobar Islands', cities: ['Port Blair'] },
  { name: 'Chandigarh', cities: ['Chandigarh'] },
  { name: 'Dadra and Nagar Haveli and Daman and Diu', cities: ['Silvassa','Daman','Diu'] },
  { name: 'Delhi', cities: ['New Delhi','Delhi','Dwarka','Rohini','Saket'] },
  { name: 'Jammu and Kashmir', cities: ['Srinagar','Jammu','Anantnag','Baramulla','Kathua','Udhampur'] },
  { name: 'Ladakh', cities: ['Leh','Kargil'] },
  { name: 'Lakshadweep', cities: ['Kavaratti'] },
  { name: 'Puducherry', cities: ['Puducherry','Karaikal','Mahe','Yanam'] },
];

export function getStatesNames(): string[] {
  return INDIA_STATES.map(s => s.name);
}

export function getCitiesForState(stateName: string): string[] {
  const state = INDIA_STATES.find(s => s.name === stateName);
  return state ? state.cities : [];
}